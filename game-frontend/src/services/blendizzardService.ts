/**
 * Blendizzard Service - Read-only contract data access
 *
 * NOTE: This file intentionally avoids `.simulate()` for common reads.
 * Simulation is convenient but can trigger multiple RPC requests per call.
 *
 * Instead, we directly fetch contract storage entries using getLedgerEntries,
 * and batch requests where possible.
 */

import {
  rpc,
  xdr,
  Address,
  scValToNative,
  Contract,
  TransactionBuilder,
  Account,
} from '@stellar/stellar-sdk'

// Configuration from environment
const BLENDIZZARD_CONTRACT = import.meta.env.VITE_BLENDIZZARD_CONTRACT || ''
const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.lightsail.network'
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Public Global Stellar Network ; September 2015'

// =============================================================================
// Multiplier calculation constants (matching contract)
// =============================================================================

const SCALAR_7 = 10_000_000n
const TARGET_AMOUNT_USD = 1000_0000000n // $1,000 with 7 decimals
const MAX_AMOUNT_USD = 10_000_0000000n // $10,000 with 7 decimals
const TARGET_TIME_SECONDS = 35n * 24n * 60n * 60n // 35 days
const MAX_TIME_SECONDS = 245n * 24n * 60n * 60n // 245 days
const COMPONENT_PEAK = 2_4494897n // sqrt(6) with 7 decimals
const DEFAULT_FREE_FP = 100_0000000n // 100 FP with 7 decimals

// =============================================================================
// Multiplier calculations
// =============================================================================

/**
 * Calculate amount multiplier using asymptotic curve
 * Peaks at $1,000, returns to 1.0x at $10,000+
 */
function calculateAmountMultiplier(amount: bigint): number {
  if (amount <= 0n) return 1.0

  if (amount <= TARGET_AMOUNT_USD) {
    // Rising phase: 1.0 → peak
    const ratio = Number(amount) / Number(TARGET_AMOUNT_USD)
    const mult = 1.0 + (Number(COMPONENT_PEAK) / Number(SCALAR_7) - 1.0) * ratio
    return mult
  } else if (amount < MAX_AMOUNT_USD) {
    // Falling phase: peak → 1.0
    const numerator = Number(amount - TARGET_AMOUNT_USD)
    const denominator = Number(MAX_AMOUNT_USD - TARGET_AMOUNT_USD)
    const ratio = numerator / denominator
    const mult = Number(COMPONENT_PEAK) / Number(SCALAR_7) - (Number(COMPONENT_PEAK) / Number(SCALAR_7) - 1.0) * ratio
    return mult
  } else {
    // Beyond max: 1.0x
    return 1.0
  }
}

/**
 * Calculate time multiplier using asymptotic curve
 * Peaks at 35 days, returns to 1.0x at 245 days+
 */
function calculateTimeMultiplier(timeHeldSeconds: bigint): number {
  if (timeHeldSeconds <= 0n) return 1.0

  if (timeHeldSeconds <= TARGET_TIME_SECONDS) {
    // Rising phase: 1.0 → peak
    const ratio = Number(timeHeldSeconds) / Number(TARGET_TIME_SECONDS)
    const mult = 1.0 + (Number(COMPONENT_PEAK) / Number(SCALAR_7) - 1.0) * ratio
    return mult
  } else if (timeHeldSeconds < MAX_TIME_SECONDS) {
    // Falling phase: peak → 1.0
    const numerator = Number(timeHeldSeconds - TARGET_TIME_SECONDS)
    const denominator = Number(MAX_TIME_SECONDS - TARGET_TIME_SECONDS)
    const ratio = numerator / denominator
    const mult = Number(COMPONENT_PEAK) / Number(SCALAR_7) - (Number(COMPONENT_PEAK) / Number(SCALAR_7) - 1.0) * ratio
    return mult
  } else {
    // Beyond max: 1.0x
    return 1.0
  }
}

/**
 * Calculate potential FP a player would have if they started a game
 * Formula: free_fp + (vault_balance * 100 * amount_mult * time_mult)
 */
function calculatePotentialFp(
  vaultBalance: bigint,
  amountMultiplier: number,
  timeMultiplier: number,
  freeFpPerEpoch: bigint = DEFAULT_FREE_FP
): bigint {
  // If no vault balance, just return free FP
  if (vaultBalance <= 0n) {
    return freeFpPerEpoch
  }

  // deposit_fp = vault_balance * 100 (base FP per USDC) * amount_mult * time_mult
  const baseFp = vaultBalance * 100n
  const combinedMult = amountMultiplier * timeMultiplier
  const depositFp = BigInt(Math.floor(Number(baseFp) * combinedMult))

  return freeFpPerEpoch + depositFp
}

const { Server: RpcServer } = rpc

let rpcInstance: InstanceType<typeof RpcServer> | null = null
function getRpc(): InstanceType<typeof RpcServer> {
  if (!rpcInstance) {
    rpcInstance = new RpcServer(RPC_URL)
  }
  return rpcInstance
}

// =============================================================================
// Storage key helpers
// =============================================================================

function buildPlayerKey(playerAddress: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Player'),
    new Address(playerAddress).toScVal(),
  ])
}

function buildEpochPlayerKey(epoch: number, playerAddress: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('EpochPlayer'),
    xdr.ScVal.scvU32(epoch),
    new Address(playerAddress).toScVal(),
  ])
}

function storageKeyToLedgerKey(
  contractId: string,
  key: xdr.ScVal,
  durability: 'temporary' | 'persistent' | 'instance' = 'temporary'
): xdr.LedgerKey {
  const contractAddress = new Address(contractId)

  if (durability === 'instance') {
    return xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: contractAddress.toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )
  }

  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key,
      durability:
        durability === 'persistent'
          ? xdr.ContractDataDurability.persistent()
          : xdr.ContractDataDurability.temporary(),
    })
  )
}

// =============================================================================
// Config and Current epoch (cached)
// =============================================================================

interface BlendizzardConfig {
  feeVault: string
  freeFpPerEpoch: bigint
}

const CACHE_TTL_MS = 10_000
let currentEpochCache: { epoch: number; fetchedAtMs: number } | null = null
let configCache: { config: BlendizzardConfig; fetchedAtMs: number } | null = null

function parseInstanceStorage(data: xdr.LedgerEntryData): { epoch: number | null; config: BlendizzardConfig | null } {
  try {
    const contractData = data.contractData()
    const instance = contractData.val().instance()
    const storage = instance.storage()

    if (!storage) return { epoch: null, config: null }

    let epoch: number | null = null
    let config: BlendizzardConfig | null = null

    for (const item of storage) {
      const key = item.key()
      const val = item.val()

      if (key.switch().name === 'scvVec') {
        const vec = key.vec()
        if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
          const symbol = vec[0].sym().toString()
          if (symbol === 'CurrentEpoch') {
            epoch = scValToNative(val) as number
          } else if (symbol === 'Config') {
            const native = scValToNative(val) as any
            config = {
              feeVault: native.fee_vault,
              freeFpPerEpoch: BigInt(native.free_fp_per_epoch ?? 100_0000000),
            }
          }
        }
      }
    }

    return { epoch, config }
  } catch (err) {
    console.error('[parseInstanceStorage] Error:', err)
    return { epoch: null, config: null }
  }
}

/**
 * Fetch instance storage (epoch + config) from the contract.
 * Caches both values to avoid duplicate RPC calls.
 */
async function fetchInstanceStorage(): Promise<{ epoch: number; config: BlendizzardConfig | null }> {
  if (!BLENDIZZARD_CONTRACT) return { epoch: 0, config: null }

  const now = Date.now()
  const epochValid = currentEpochCache && now - currentEpochCache.fetchedAtMs < CACHE_TTL_MS
  const configValid = configCache && now - configCache.fetchedAtMs < CACHE_TTL_MS

  if (epochValid && configValid) {
    return { epoch: currentEpochCache!.epoch, config: configCache!.config }
  }

  try {
    const rpcClient = getRpc()
    const instanceLedgerKey = storageKeyToLedgerKey(BLENDIZZARD_CONTRACT, xdr.ScVal.scvU32(0), 'instance')
    const response = await rpcClient.getLedgerEntries(instanceLedgerKey)

    const entry0 = response.entries?.[0]
    if (!entry0) return { epoch: 0, config: null }

    const { epoch, config } = parseInstanceStorage(entry0.val)
    const epochValue = epoch ?? 0

    currentEpochCache = { epoch: epochValue, fetchedAtMs: now }
    if (config) {
      configCache = { config, fetchedAtMs: now }
    }

    return { epoch: epochValue, config }
  } catch (err) {
    console.error('[fetchInstanceStorage] Error:', err)
    return { epoch: 0, config: null }
  }
}

/**
 * Get current epoch by reading contract instance storage.
 * Cached briefly to avoid duplicate calls during initial app load.
 */
export async function getCurrentEpoch(): Promise<number> {
  const { epoch } = await fetchInstanceStorage()
  return epoch
}

/**
 * Get config from contract instance storage.
 */
async function getConfig(): Promise<BlendizzardConfig | null> {
  const { config } = await fetchInstanceStorage()
  return config
}

/**
 * Get player's underlying vault balance from the fee vault contract.
 * Uses simulation to call get_underlying_tokens() which returns actual USDC value.
 */
async function getVaultBalance(feeVaultContract: string, playerAddress: string): Promise<bigint> {
  try {
    const rpcClient = getRpc()
    const contract = new Contract(feeVaultContract)

    // Build the function call for get_underlying_tokens(user: Address)
    const op = contract.call(
      'get_underlying_tokens',
      new Address(playerAddress).toScVal()
    )

    // Simulate the call with a dummy transaction
    const dummyAccount = new Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      '0'
    )
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(30)
      .build()

    const result = await rpcClient.simulateTransaction(tx)

    if ('result' in result && result.result) {
      const returnValue = result.result.retval
      return BigInt(scValToNative(returnValue) as number | bigint)
    }

    return 0n
  } catch (err) {
    console.error('[getVaultBalance] Error:', err)
    return 0n
  }
}

/**
 * Get player data (for time multiplier calculation).
 */
async function getPlayerData(playerAddress: string): Promise<{ timeMultiplierStart: bigint } | null> {
  if (!BLENDIZZARD_CONTRACT) return null

  try {
    const rpcClient = getRpc()
    const playerKey = buildPlayerKey(playerAddress)
    const ledgerKey = storageKeyToLedgerKey(BLENDIZZARD_CONTRACT, playerKey, 'persistent')

    const response = await rpcClient.getLedgerEntries(ledgerKey)
    const entry = response.entries?.[0]

    if (!entry) return null

    const native = scValToNative(entry.val.contractData().val()) as any
    return {
      timeMultiplierStart: BigInt(native.time_multiplier_start ?? 0),
    }
  } catch (err) {
    console.error('[getPlayerData] Error:', err)
    return null
  }
}

/**
 * Calculate potential FP for a player who hasn't played a game this epoch yet.
 */
async function getPotentialFp(playerAddress: string): Promise<bigint> {
  try {
    const config = await getConfig()
    if (!config) return DEFAULT_FREE_FP

    // Fetch vault balance and player data in parallel
    const [vaultBalance, playerData] = await Promise.all([
      getVaultBalance(config.feeVault, playerAddress),
      getPlayerData(playerAddress),
    ])

    // Calculate multipliers
    const amountMult = calculateAmountMultiplier(vaultBalance)

    let timeMult = 1.0
    if (playerData && playerData.timeMultiplierStart > 0n) {
      const now = BigInt(Math.floor(Date.now() / 1000))
      const timeHeld = now - playerData.timeMultiplierStart
      timeMult = calculateTimeMultiplier(timeHeld)
    }

    return calculatePotentialFp(vaultBalance, amountMult, timeMult, config.freeFpPerEpoch)
  } catch (err) {
    console.error('[getPotentialFp] Error:', err)
    return DEFAULT_FREE_FP
  }
}

/**
 * Get player's available FP for the current epoch.
 * If player hasn't played a game this epoch, calculates potential FP based on vault balance.
 */
export async function getAvailableFp(playerAddress: string): Promise<bigint> {
  if (!BLENDIZZARD_CONTRACT) return DEFAULT_FREE_FP

  try {
    const rpcClient = getRpc()
    const epoch = await getCurrentEpoch()

    const epochPlayerKey = buildEpochPlayerKey(epoch, playerAddress)
    const epochPlayerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      epochPlayerKey,
      'temporary'
    )

    const response = await rpcClient.getLedgerEntries(epochPlayerLedgerKey)
    const entry0 = response.entries?.[0]

    if (!entry0) {
      // Not found => player hasn't played a game this epoch yet
      // Calculate potential FP based on vault balance and multipliers
      return getPotentialFp(playerAddress)
    }

    const native = scValToNative(entry0.val.contractData().val()) as any
    if (native && native.available_fp !== undefined && native.available_fp !== null) {
      return BigInt(native.available_fp)
    }

    // Fallback to potential FP calculation if available_fp is missing
    return getPotentialFp(playerAddress)
  } catch (err) {
    console.error('[getAvailableFp] Error:', err)
    return getPotentialFp(playerAddress)
  }
}

/**
 * Get full epoch player data from contract storage.
 * Returns the parsed native object (snake_case keys), or null if missing.
 */
export async function getEpochPlayer(playerAddress: string, epoch?: number) {
  if (!BLENDIZZARD_CONTRACT) return null

  try {
    const rpcClient = getRpc()
    const currentEpoch = epoch ?? await getCurrentEpoch()

    const epochPlayerKey = buildEpochPlayerKey(currentEpoch, playerAddress)
    const epochPlayerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      epochPlayerKey,
      'temporary'
    )

    const response = await rpcClient.getLedgerEntries(epochPlayerLedgerKey)
    const entry0 = response.entries?.[0]
    if (!entry0) return null

    return scValToNative(entry0.val.contractData().val())
  } catch (err) {
    console.error('[getEpochPlayer] Error:', err)
    return null
  }
}

/**
 * Check if player has selected a faction.
 * Reads the Player entry from contract storage instead of simulating.
 */
export async function hasFactionSelected(playerAddress: string): Promise<boolean> {
  if (!BLENDIZZARD_CONTRACT) return false

  try {
    const rpcClient = getRpc()

    const playerKey = buildPlayerKey(playerAddress)
    const playerLedgerKey = storageKeyToLedgerKey(BLENDIZZARD_CONTRACT, playerKey, 'persistent')

    const response = await rpcClient.getLedgerEntries(playerLedgerKey)
    const entry0 = response.entries?.[0]

    // No ledger entry => player does not exist => no faction selected
    return !!entry0
  } catch (err) {
    console.error('[hasFactionSelected] Error:', err)
    return false
  }
}

/**
 * Convenience method for the lobby: fetch faction status + current epoch + available FP
 * with (at most) 2 RPC calls. Falls back to potential FP calculation if no games played this epoch.
 */
export async function getLobbyPlayerData(playerAddress: string): Promise<{
  hasFaction: boolean
  epoch: number
  availableFp: bigint
}> {
  const epoch = await getCurrentEpoch()

  if (!BLENDIZZARD_CONTRACT) {
    const availableFp = await getPotentialFp(playerAddress)
    return { hasFaction: false, epoch, availableFp }
  }

  try {
    const rpcClient = getRpc()

    const playerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      buildPlayerKey(playerAddress),
      'persistent'
    )

    const epochPlayerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      buildEpochPlayerKey(epoch, playerAddress),
      'temporary'
    )

    const response = await rpcClient.getLedgerEntries(playerLedgerKey, epochPlayerLedgerKey)

    // IMPORTANT: getLedgerEntries does NOT return entries in order and only returns found entries.
    // Match entries by inspecting the key symbol.
    let playerEntry: typeof response.entries[0] | undefined
    let epochPlayerEntry: typeof response.entries[0] | undefined

    for (const entry of response.entries || []) {
      try {
        const key = entry.key.contractData().key()
        if (key.switch().name === 'scvVec') {
          const vec = key.vec()
          if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
            const symbol = vec[0].sym().toString()
            if (symbol === 'Player') {
              playerEntry = entry
            } else if (symbol === 'EpochPlayer') {
              epochPlayerEntry = entry
            }
          }
        }
      } catch {
        // Skip entries that don't match expected structure
      }
    }

    const hasFaction = !!playerEntry

    let availableFp: bigint
    if (epochPlayerEntry) {
      try {
        const native = scValToNative(epochPlayerEntry.val.contractData().val()) as any
        if (native && native.available_fp !== undefined && native.available_fp !== null) {
          availableFp = BigInt(native.available_fp)
        } else {
          // available_fp is missing, calculate potential FP
          availableFp = await getPotentialFp(playerAddress)
        }
      } catch (err) {
        console.warn('[getLobbyPlayerData] Failed to parse epoch player data:', err)
        availableFp = await getPotentialFp(playerAddress)
      }
    } else {
      // No EpochPlayer entry => player hasn't played a game this epoch
      availableFp = await getPotentialFp(playerAddress)
    }

    return { hasFaction, epoch, availableFp }
  } catch (err) {
    console.error('[getLobbyPlayerData] Error:', err)
    const availableFp = await getPotentialFp(playerAddress)
    return { hasFaction: false, epoch, availableFp }
  }
}

/**
 * Optimized batch fetch for GamePage initial load.
 * Fetches all required data in a SINGLE getLedgerEntries call:
 * - Instance storage (epoch + config)
 * - Player storage (hasFaction + timeMultiplierStart)
 * - EpochPlayer storage (available_fp if exists)
 *
 * Reduces 5 RPC calls down to 1-2 (1 if EpochPlayer exists, 2 if vault simulation needed).
 */
export async function getGamePageData(playerAddress: string): Promise<{
  hasFaction: boolean
  epoch: number
  availableFp: bigint
  config: BlendizzardConfig | null
}> {
  if (!BLENDIZZARD_CONTRACT) {
    return { hasFaction: false, epoch: 0, availableFp: DEFAULT_FREE_FP, config: null }
  }

  try {
    const rpcClient = getRpc()
    const now = Date.now()

    // Build all ledger keys for batch fetch
    const instanceLedgerKey = storageKeyToLedgerKey(BLENDIZZARD_CONTRACT, xdr.ScVal.scvU32(0), 'instance')
    const playerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      buildPlayerKey(playerAddress),
      'persistent'
    )

    // We need epoch to build epochPlayer key, but we can fetch instance + player first,
    // then epoch player in a second call. OR we can use cached epoch if available.
    const cachedEpoch = currentEpochCache && (now - currentEpochCache.fetchedAtMs < CACHE_TTL_MS)
      ? currentEpochCache.epoch
      : null

    if (cachedEpoch !== null) {
      // Best case: epoch is cached, fetch all 3 in one call
      const epochPlayerLedgerKey = storageKeyToLedgerKey(
        BLENDIZZARD_CONTRACT,
        buildEpochPlayerKey(cachedEpoch, playerAddress),
        'temporary'
      )

      const response = await rpcClient.getLedgerEntries(instanceLedgerKey, playerLedgerKey, epochPlayerLedgerKey)

      // Parse instance storage (updates cache)
      const instanceEntry = response.entries?.find(e => {
        try {
          const key = e.key.contractData().key()
          return key.switch().name === 'scvLedgerKeyContractInstance'
        } catch {
          return false
        }
      })

      let epoch = cachedEpoch
      let config: BlendizzardConfig | null = configCache?.config ?? null

      if (instanceEntry) {
        const parsed = parseInstanceStorage(instanceEntry.val)
        if (parsed.epoch !== null) {
          epoch = parsed.epoch
          currentEpochCache = { epoch, fetchedAtMs: now }
        }
        if (parsed.config) {
          config = parsed.config
          configCache = { config, fetchedAtMs: now }
        }
      }

      // Find player and epochPlayer entries
      const playerEntry = response.entries?.find(e => {
        try {
          const key = e.key.contractData().key()
          if (key.switch().name !== 'scvVec') return false
          const vec = key.vec()
          return vec && vec.length > 0 && vec[0].sym?.()?.toString() === 'Player'
        } catch {
          return false
        }
      })

      const epochPlayerEntry = response.entries?.find(e => {
        try {
          const key = e.key.contractData().key()
          if (key.switch().name !== 'scvVec') return false
          const vec = key.vec()
          return vec && vec.length > 0 && vec[0].sym?.()?.toString() === 'EpochPlayer'
        } catch {
          return false
        }
      })

      const hasFaction = !!playerEntry

      // Calculate available FP
      let availableFp: bigint
      if (epochPlayerEntry) {
        const native = scValToNative(epochPlayerEntry.val.contractData().val()) as any
        if (native?.available_fp !== undefined && native.available_fp !== null) {
          availableFp = BigInt(native.available_fp)
        } else {
          availableFp = await calculatePotentialFpWithPlayerEntry(playerAddress, playerEntry, config)
        }
      } else {
        availableFp = await calculatePotentialFpWithPlayerEntry(playerAddress, playerEntry, config)
      }

      return { hasFaction, epoch, availableFp, config }
    }

    // No cached epoch: need to fetch instance first to get epoch
    const instanceResponse = await rpcClient.getLedgerEntries(instanceLedgerKey)
    const instanceEntry = instanceResponse.entries?.[0]

    let epoch = 0
    let config: BlendizzardConfig | null = null

    if (instanceEntry) {
      const parsed = parseInstanceStorage(instanceEntry.val)
      epoch = parsed.epoch ?? 0
      config = parsed.config
      currentEpochCache = { epoch, fetchedAtMs: now }
      if (config) {
        configCache = { config, fetchedAtMs: now }
      }
    }

    // Now fetch player + epochPlayer in one call
    const epochPlayerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      buildEpochPlayerKey(epoch, playerAddress),
      'temporary'
    )

    const response = await rpcClient.getLedgerEntries(playerLedgerKey, epochPlayerLedgerKey)

    // IMPORTANT: getLedgerEntries does NOT return entries in order and only returns found entries.
    // Match entries by inspecting the key symbol.
    let playerEntry: typeof response.entries[0] | undefined
    let epochPlayerEntry: typeof response.entries[0] | undefined

    for (const entry of response.entries || []) {
      try {
        const key = entry.key.contractData().key()
        if (key.switch().name === 'scvVec') {
          const vec = key.vec()
          if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
            const symbol = vec[0].sym().toString()
            if (symbol === 'Player') {
              playerEntry = entry
            } else if (symbol === 'EpochPlayer') {
              epochPlayerEntry = entry
            }
          }
        }
      } catch {
        // Skip entries that don't match expected structure
      }
    }

    const hasFaction = !!playerEntry

    let availableFp: bigint
    if (epochPlayerEntry) {
      const native = scValToNative(epochPlayerEntry.val.contractData().val()) as any
      if (native?.available_fp !== undefined && native.available_fp !== null) {
        availableFp = BigInt(native.available_fp)
      } else {
        availableFp = await calculatePotentialFpWithPlayerEntry(playerAddress, playerEntry, config)
      }
    } else {
      availableFp = await calculatePotentialFpWithPlayerEntry(playerAddress, playerEntry, config)
    }

    return { hasFaction, epoch, availableFp, config }
  } catch (err) {
    console.error('[getGamePageData] Error:', err)
    return { hasFaction: false, epoch: 0, availableFp: DEFAULT_FREE_FP, config: null }
  }
}

/**
 * Calculate potential FP using an already-fetched player entry (avoids duplicate RPC).
 */
async function calculatePotentialFpWithPlayerEntry(
  playerAddress: string,
  playerEntry: rpc.Api.LedgerEntryResult | undefined,
  config: BlendizzardConfig | null
): Promise<bigint> {
  const effectiveConfig = config ?? await getConfig()
  if (!effectiveConfig) return DEFAULT_FREE_FP

  // Get vault balance (requires simulation, can't batch with getLedgerEntries)
  const vaultBalance = await getVaultBalance(effectiveConfig.feeVault, playerAddress)

  // Extract timeMultiplierStart from player entry if available
  let timeMult = 1.0
  if (playerEntry) {
    try {
      const native = scValToNative(playerEntry.val.contractData().val()) as any
      const timeMultiplierStart = BigInt(native?.time_multiplier_start ?? 0)
      if (timeMultiplierStart > 0n) {
        const now = BigInt(Math.floor(Date.now() / 1000))
        const timeHeld = now - timeMultiplierStart
        timeMult = calculateTimeMultiplier(timeHeld)
      }
    } catch (err) {
      console.warn('[calculatePotentialFpWithPlayerEntry] Failed to parse player data:', err)
    }
  }

  const amountMult = calculateAmountMultiplier(vaultBalance)
  return calculatePotentialFp(vaultBalance, amountMult, timeMult, effectiveConfig.freeFpPerEpoch)
}
