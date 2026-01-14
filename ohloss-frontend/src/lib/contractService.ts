// Contract interaction services
// Uses the generated bindings + smart-account-kit for signing

import { Client as OhlossClient, type EpochInfo, type EpochPlayer, type Player, type Config } from 'ohloss'
import { Client as FeeVaultClient } from 'fee-vault'
import { rpc, Address, xdr, scValToNative } from '@stellar/stellar-sdk'
import { getKit, signAndSubmitWithTurnstile } from './smartAccount'

const { Server: RpcServer } = rpc

// Configuration from environment
const CONFIG = {
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  ohlossContract: import.meta.env.VITE_OHLOSS_CONTRACT || '',
  feeVaultContract: import.meta.env.VITE_FEE_VAULT_CONTRACT || '',
  usdcTokenContract: import.meta.env.VITE_USDC_TOKEN_CONTRACT || '',
  nativeTokenContract: import.meta.env.VITE_NATIVE_TOKEN_CONTRACT || '',
}

// Default options for contract calls
const DEFAULT_OPTIONS = {
  timeoutInSeconds: 30,
  fee: '100',
}

// =============================================================================
// Contract Clients
// =============================================================================

let ohlossClient: OhlossClient | null = null
let feeVaultClient: FeeVaultClient | null = null
let rpcInstance: InstanceType<typeof RpcServer> | null = null

export function getRpc(): InstanceType<typeof RpcServer> {
  if (!rpcInstance) {
    rpcInstance = new RpcServer(CONFIG.rpcUrl)
  }
  return rpcInstance
}

function getOhlossClient(): OhlossClient {
  if (!ohlossClient) {
    ohlossClient = new OhlossClient({
      contractId: CONFIG.ohlossContract,
      networkPassphrase: CONFIG.networkPassphrase,
      rpcUrl: CONFIG.rpcUrl,
    })
  }
  return ohlossClient
}

function getFeeVaultClient(): FeeVaultClient {
  if (!feeVaultClient) {
    feeVaultClient = new FeeVaultClient({
      contractId: CONFIG.feeVaultContract,
      networkPassphrase: CONFIG.networkPassphrase,
      rpcUrl: CONFIG.rpcUrl,
    })
  }
  return feeVaultClient
}

/**
 * Create a client for building transactions
 * Note: We don't pass publicKey because smart accounts use C-addresses (contract IDs)
 * which are not valid for the SDK's publicKey field (expects G-addresses).
 * The kit.signAndSubmit() will handle setting the correct source account.
 */
function createSigningOhlossClient(): OhlossClient {
  return new OhlossClient({
    contractId: CONFIG.ohlossContract,
    networkPassphrase: CONFIG.networkPassphrase,
    rpcUrl: CONFIG.rpcUrl,
  })
}

function createSigningFeeVaultClient(): FeeVaultClient {
  return new FeeVaultClient({
    contractId: CONFIG.feeVaultContract,
    networkPassphrase: CONFIG.networkPassphrase,
    rpcUrl: CONFIG.rpcUrl,
  })
}

// =============================================================================
// Ohloss Read Operations
// =============================================================================

export async function getCurrentEpoch(): Promise<number> {
  const client = getOhlossClient()
  const tx = await client.get_current_epoch()
  const result = await tx.simulate()
  return Number(result.result)
}

export async function getEpochInfo(epoch: number): Promise<EpochInfo | null> {
  try {
    const client = getOhlossClient()
    const tx = await client.get_epoch({ epoch })
    const result = await tx.simulate()
    return result.result.unwrap()
  } catch (error) {
    console.error(`Error fetching epoch ${epoch}:`, error)
    return null
  }
}

export async function getPlayerData(playerAddress: string): Promise<Player | null> {
  const startTime = Date.now()
  console.log('[contractService] getPlayerData START:', playerAddress)
  try {
    const client = getOhlossClient()
    console.log('[contractService] getPlayerData - client created')
    const tx = await client.get_player({ player: playerAddress })
    console.log('[contractService] getPlayerData - tx created, simulating...')
    const result = await tx.simulate()
    console.log('[contractService] getPlayerData - simulation complete, duration:', Date.now() - startTime, 'ms')
    return result.result.unwrap()
  } catch (error) {
    console.error(`[contractService] Error fetching player ${playerAddress} (duration: ${Date.now() - startTime}ms):`, error)
    return null
  }
}

export async function getEpochPlayerData(
  epoch: number,
  playerAddress: string
): Promise<EpochPlayer | null> {
  try {
    const client = getOhlossClient()
    const tx = await client.get_epoch_player({ epoch, player: playerAddress })
    const result = await tx.simulate()
    return result.result.unwrap()
  } catch (error) {
    console.error(`Error fetching epoch player for epoch ${epoch}:`, error)
    return null
  }
}

export async function getConfig(): Promise<Config | null> {
  try {
    const client = getOhlossClient()
    const tx = await client.get_config()
    const result = await tx.simulate()
    return result.result
  } catch (error) {
    console.error('Error fetching config:', error)
    return null
  }
}

export async function isPaused(): Promise<boolean> {
  try {
    const client = getOhlossClient()
    const tx = await client.is_paused()
    const result = await tx.simulate()
    return result.result
  } catch (error) {
    console.error('Error checking pause state:', error)
    return false
  }
}

// =============================================================================
// Ohloss Write Operations
// =============================================================================

/**
 * Select a faction for the player
 * Uses smart-account-kit for signing, relayerService for submission (Turnstile support)
 */
export async function selectFaction(
  playerAddress: string,
  faction: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const kit = getKit()

    if (!kit.isConnected) {
      return { success: false, error: 'Wallet not connected' }
    }

    const client = createSigningOhlossClient()
    const tx = await client.select_faction({ player: playerAddress, faction }, DEFAULT_OPTIONS)

    // Use signAndSubmitWithTurnstile which includes Turnstile header for production
    const result = await signAndSubmitWithTurnstile(tx)

    return {
      success: result.success,
      error: result.error,
    }
  } catch (error) {
    console.error('Error selecting faction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to select faction',
    }
  }
}

/**
 * Cycle to the next epoch
 * Anyone can call this if the epoch has ended
 */
export async function cycleEpoch(): Promise<{ success: boolean; newEpoch?: number; error?: string }> {
  try {
    const kit = getKit()

    if (!kit.isConnected) {
      return { success: false, error: 'Wallet not connected' }
    }

    const client = createSigningOhlossClient()
    const tx = await client.cycle_epoch(DEFAULT_OPTIONS)

    // Use signAndSubmitWithTurnstile which includes Turnstile header for production
    const result = await signAndSubmitWithTurnstile(tx)

    if (result.success) {
      // Fetch the new epoch number
      const newEpoch = await getCurrentEpoch()
      return { success: true, newEpoch }
    }

    return { success: false, error: result.error }
  } catch (error) {
    console.error('Error cycling epoch:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cycle epoch',
    }
  }
}

/**
 * Claim epoch reward for a player
 */
export async function claimEpochReward(
  playerAddress: string,
  epoch: number
): Promise<{ success: boolean; amount?: bigint; error?: string }> {
  try {
    const kit = getKit()

    if (!kit.isConnected) {
      return { success: false, error: 'Wallet not connected' }
    }

    const client = createSigningOhlossClient()
    const tx = await client.claim_epoch_reward({ player: playerAddress, epoch }, DEFAULT_OPTIONS)

    // Use signAndSubmitWithTurnstile which includes Turnstile header for production
    const result = await signAndSubmitWithTurnstile(tx)

    return {
      success: result.success,
      error: result.error,
    }
  } catch (error) {
    console.error('Error claiming epoch reward:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim reward',
    }
  }
}

/**
 * Claim developer reward for a specific epoch
 */
export async function claimDevReward(
  developer: string,
  epoch: number
): Promise<{ success: boolean; amount?: bigint; error?: string }> {
  try {
    const kit = getKit()

    if (!kit.isConnected) {
      return { success: false, error: 'Wallet not connected' }
    }

    const client = createSigningOhlossClient()
    const tx = await client.claim_dev_reward({ developer, epoch }, DEFAULT_OPTIONS)

    // Use signAndSubmitWithTurnstile which includes Turnstile header for production
    const result = await signAndSubmitWithTurnstile(tx)

    return {
      success: result.success,
      error: result.error,
    }
  } catch (error) {
    console.error('Error claiming dev reward:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim dev reward',
    }
  }
}

/**
 * Check if a reward can be claimed (via simulation)
 */
export async function canClaimEpochReward(
  playerAddress: string,
  epoch: number
): Promise<{ canClaim: boolean; estimatedAmount?: bigint }> {
  try {
    const client = new OhlossClient({
      contractId: CONFIG.ohlossContract,
      networkPassphrase: CONFIG.networkPassphrase,
      rpcUrl: CONFIG.rpcUrl,
      publicKey: playerAddress,
    })

    const tx = await client.claim_epoch_reward({ player: playerAddress, epoch })
    const simResult = await tx.simulate()

    // Check if result is Ok (not Err)
    const result = simResult.result
    if (result && typeof result === 'object' && 'error' in result) {
      return { canClaim: false }
    }

    if (result !== undefined && result !== null) {
      // Try to extract the amount
      let amount: bigint | undefined
      if (typeof result === 'bigint') {
        amount = result
      } else if (typeof result === 'number') {
        amount = BigInt(result)
      }
      return { canClaim: true, estimatedAmount: amount }
    }

    return { canClaim: false }
  } catch (error) {
    console.error(`Error checking claim for epoch ${epoch}:`, error)
    return { canClaim: false }
  }
}

// =============================================================================
// Fee Vault Operations
// =============================================================================

export async function getVaultBalance(userAddress: string): Promise<bigint> {
  try {
    const client = getFeeVaultClient()
    const tx = await client.get_underlying_tokens({ user: userAddress })
    const result = await tx.simulate()
    return BigInt(result.result)
  } catch (error) {
    console.error('Error fetching vault balance:', error)
    return 0n
  }
}

export async function getVaultShares(userAddress: string): Promise<bigint> {
  try {
    const client = getFeeVaultClient()
    const tx = await client.get_shares({ user: userAddress })
    const result = await tx.simulate()
    return BigInt(result.result)
  } catch (error) {
    console.error('Error fetching vault shares:', error)
    return 0n
  }
}

export async function getVaultSummary() {
  try {
    const client = getFeeVaultClient()
    const tx = await client.get_vault_summary()
    const result = await tx.simulate()
    return result.result
  } catch (error) {
    console.error('Error fetching vault summary:', error)
    return null
  }
}

/**
 * Deposit into the vault
 */
export async function depositToVault(
  userAddress: string,
  amount: bigint
): Promise<{ success: boolean; error?: string }> {
  try {
    const kit = getKit()

    if (!kit.isConnected) {
      return { success: false, error: 'Wallet not connected' }
    }

    const client = createSigningFeeVaultClient()
    const tx = await client.deposit({ user: userAddress, amount }, DEFAULT_OPTIONS)

    // Use signAndSubmitWithTurnstile which includes Turnstile header for production
    const result = await signAndSubmitWithTurnstile(tx)

    return {
      success: result.success,
      error: result.error,
    }
  } catch (error) {
    console.error('Error depositing to vault:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to deposit',
    }
  }
}

/**
 * Withdraw from the vault
 */
export async function withdrawFromVault(
  userAddress: string,
  amount: bigint
): Promise<{ success: boolean; error?: string }> {
  try {
    const kit = getKit()

    if (!kit.isConnected) {
      return { success: false, error: 'Wallet not connected' }
    }

    const client = createSigningFeeVaultClient()
    const tx = await client.withdraw({ user: userAddress, amount }, DEFAULT_OPTIONS)

    // Use signAndSubmitWithTurnstile which includes Turnstile header for production
    const result = await signAndSubmitWithTurnstile(tx)

    return {
      success: result.success,
      error: result.error,
    }
  } catch (error) {
    console.error('Error withdrawing from vault:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to withdraw',
    }
  }
}

// =============================================================================
// Token Balance Operations
// =============================================================================

/**
 * Get token balance for an address
 */
export async function getTokenBalance(
  tokenContract: string,
  address: string
): Promise<bigint> {
  const rpcClient = getRpc()

  try {
    const balanceKey = xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol('Balance'),
      new Address(address).toScVal(),
    ])

    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(tokenContract).toScAddress(),
        key: balanceKey,
        durability: xdr.ContractDataDurability.persistent(),
      })
    )

    const response = await rpcClient.getLedgerEntries(ledgerKey)

    if (response.entries && response.entries.length > 0) {
      const entry = response.entries[0]
      const contractData = entry.val.contractData()
      const val = contractData.val()

      // Balance is stored as i128
      if (val.switch().name === 'scvI128') {
        const i128 = val.i128()
        const lo = BigInt(i128.lo().toString())
        const hi = BigInt(i128.hi().toString())
        return (hi << 64n) | lo
      }
    }

    return 0n
  } catch (error) {
    console.error('Error fetching token balance:', error)
    return 0n
  }
}

export async function getXLMBalance(address: string): Promise<bigint> {
  return getTokenBalance(CONFIG.nativeTokenContract, address)
}

export async function getUSDCBalance(address: string): Promise<bigint> {
  return getTokenBalance(CONFIG.usdcTokenContract, address)
}

// =============================================================================
// Batch Data Fetching (for rewards)
// =============================================================================

const MAX_LEDGER_ENTRIES_PER_REQUEST = 200

/**
 * Build storage key for EpochPlayer
 */
function buildEpochPlayerKey(epoch: number, address: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('EpochPlayer'),
    xdr.ScVal.scvU32(epoch),
    new Address(address).toScVal(),
  ])
}

/**
 * Build storage key for Epoch
 */
function buildEpochKey(epoch: number): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Epoch'),
    xdr.ScVal.scvU32(epoch),
  ])
}

/**
 * Build storage key for EpochGame (keyed by developer address)
 */
function buildEpochGameKey(epoch: number, developerAddress: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('EpochGame'),
    xdr.ScVal.scvU32(epoch),
    new Address(developerAddress).toScVal(),
  ])
}

/**
 * Build storage key for Game (GameInfo)
 */
function buildGameKey(gameAddress: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Game'),
    new Address(gameAddress).toScVal(),
  ])
}

/**
 * Convert storage key to ledger key
 */
function storageKeyToLedgerKey(
  contractId: string,
  key: xdr.ScVal,
  durability: 'temporary' | 'persistent' = 'temporary'
): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability:
        durability === 'persistent'
          ? xdr.ContractDataDurability.persistent()
          : xdr.ContractDataDurability.temporary(),
    })
  )
}

/**
 * Batch fetch ledger entries
 *
 * IMPORTANT: getLedgerEntries does NOT return entries in order and only returns found entries.
 * We match returned entries to original keys using XDR base64 comparison.
 */
async function batchGetLedgerEntries(
  keys: xdr.LedgerKey[]
): Promise<(xdr.LedgerEntryData | null)[]> {
  const rpcClient = getRpc()
  const results: (xdr.LedgerEntryData | null)[] = new Array(keys.length).fill(null)

  // Create a map from key XDR (base64) to original index for matching
  const keyB64ToIndex = new Map<string, number>()
  keys.forEach((key, index) => {
    keyB64ToIndex.set(key.toXDR('base64'), index)
  })

  // Split into batches of 200
  for (let i = 0; i < keys.length; i += MAX_LEDGER_ENTRIES_PER_REQUEST) {
    const batch = keys.slice(i, i + MAX_LEDGER_ENTRIES_PER_REQUEST)

    try {
      const response = await rpcClient.getLedgerEntries(...batch)

      if (response.entries) {
        // Match each returned entry to its original key by XDR comparison
        for (const entry of response.entries) {
          const entryKeyB64 = entry.key.toXDR('base64')
          const originalIndex = keyB64ToIndex.get(entryKeyB64)
          if (originalIndex !== undefined) {
            results[originalIndex] = entry.val
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching ledger entries batch ${i}:`, error)
    }
  }

  return results
}

/**
 * Parse EpochInfo from ledger entry
 */
function parseEpochInfo(data: xdr.LedgerEntryData | null): EpochInfo | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    const native = scValToNative(val)

    return {
      start_time: BigInt(native.start_time),
      end_time: BigInt(native.end_time),
      faction_standings: new Map(
        Object.entries(native.faction_standings || {}).map(([k, v]) => [
          Number(k),
          BigInt(String(v)),
        ])
      ),
      reward_pool: BigInt(native.reward_pool),
      dev_reward_pool: BigInt(native.dev_reward_pool || 0),
      total_game_fp: BigInt(native.total_game_fp || 0),
      winning_faction: native.winning_faction,
      is_finalized: native.is_finalized,
    } as EpochInfo
  } catch (error) {
    console.error('Error parsing EpochInfo:', error)
    return null
  }
}

/**
 * Parse EpochPlayer from ledger entry
 */
function parseEpochPlayer(data: xdr.LedgerEntryData | null): EpochPlayer | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    const native = scValToNative(val)

    return {
      epoch_faction: native.epoch_faction ?? null,
      epoch_balance_snapshot: BigInt(native.epoch_balance_snapshot),
      available_fp: BigInt(native.available_fp),
      total_fp_contributed: BigInt(native.total_fp_contributed),
    } as EpochPlayer
  } catch (error) {
    console.error('Error parsing EpochPlayer:', error)
    return null
  }
}

/**
 * Fetch claimable player rewards for the last 100 epochs
 */
export interface ClaimableReward {
  epoch: number
  amount: bigint
  faction: number
  fpContributed: bigint
}

export async function fetchPlayerRewards(
  playerAddress: string,
  currentEpoch: number,
  epochsToFetch = 100
): Promise<ClaimableReward[]> {
  const contractId = CONFIG.ohlossContract
  const startEpoch = Math.max(0, currentEpoch - epochsToFetch)
  const numEpochs = currentEpoch - startEpoch

  if (numEpochs <= 0) return []

  // Build keys for EpochPlayer and Epoch info for each epoch
  const keys: xdr.LedgerKey[] = []

  for (let epoch = startEpoch; epoch < currentEpoch; epoch++) {
    // EpochPlayer key
    keys.push(
      storageKeyToLedgerKey(contractId, buildEpochPlayerKey(epoch, playerAddress), 'temporary')
    )
    // Epoch info key
    keys.push(storageKeyToLedgerKey(contractId, buildEpochKey(epoch), 'temporary'))
  }

  // Batch fetch
  const results = await batchGetLedgerEntries(keys)

  // Process results
  const rewards: ClaimableReward[] = []

  for (let i = 0; i < numEpochs; i++) {
    const epoch = startEpoch + i
    const epochPlayerData = results[i * 2]
    const epochInfoData = results[i * 2 + 1]

    const epochPlayer = parseEpochPlayer(epochPlayerData)
    const epochInfo = parseEpochInfo(epochInfoData)

    if (!epochPlayer || !epochInfo) continue

    // Check if epoch is finalized and player was in winning faction
    const playerFaction = epochPlayer.epoch_faction
    const winningFaction = epochInfo.winning_faction

    if (
      epochInfo.is_finalized &&
      winningFaction !== undefined &&
      winningFaction !== null &&
      playerFaction !== undefined &&
      playerFaction !== null &&
      playerFaction === winningFaction &&
      epochPlayer.total_fp_contributed > 0n
    ) {
      // Calculate estimated reward
      const playerFp = BigInt(epochPlayer.total_fp_contributed)
      const rewardPool = BigInt(epochInfo.reward_pool)
      const winningFactionFp = BigInt(epochInfo.faction_standings.get(winningFaction) ?? 1)
      const estimatedReward = (playerFp * rewardPool) / winningFactionFp

      if (estimatedReward > 0n) {
        rewards.push({
          epoch,
          amount: estimatedReward,
          faction: playerFaction as number,
          fpContributed: playerFp,
        })
      }
    }
  }

  return rewards
}

/**
 * Fetch claimable developer rewards for the last 100 epochs
 */
export interface DevClaimableReward {
  epoch: number
  developerAddress: string
  amount: bigint
  fpContributed: bigint
}

/**
 * Fetch claimable developer rewards for the last 100 epochs
 * Now queries by developer address (EpochGame is keyed by developer, not game)
 */
export async function fetchDevRewards(
  developerAddress: string,
  currentEpoch: number,
  epochsToFetch = 100
): Promise<DevClaimableReward[]> {
  if (!developerAddress) return []

  const contractId = CONFIG.ohlossContract
  const startEpoch = Math.max(0, currentEpoch - epochsToFetch)
  const numEpochs = currentEpoch - startEpoch

  if (numEpochs <= 0) return []

  // Build keys for EpochGame (by developer) and Epoch info for each epoch
  const keys: xdr.LedgerKey[] = []

  for (let epoch = startEpoch; epoch < currentEpoch; epoch++) {
    // EpochGame key (now keyed by developer address)
    keys.push(
      storageKeyToLedgerKey(contractId, buildEpochGameKey(epoch, developerAddress), 'temporary')
    )
    // Epoch info key
    keys.push(storageKeyToLedgerKey(contractId, buildEpochKey(epoch), 'temporary'))
  }

  // Batch fetch
  const results = await batchGetLedgerEntries(keys)

  // Process results
  const rewards: DevClaimableReward[] = []

  for (let i = 0; i < numEpochs; i++) {
    const epoch = startEpoch + i
    const epochGameData = results[i * 2]
    const epochInfoData = results[i * 2 + 1]

    if (!epochGameData || !epochInfoData) continue

    try {
      // Parse EpochGame
      const contractData = epochGameData.contractData()
      const val = contractData.val()
      const native = scValToNative(val)

      const epochGame = {
        total_fp_contributed: BigInt(native.total_fp_contributed || 0),
      }

      // Parse EpochInfo
      const epochInfo = parseEpochInfo(epochInfoData)
      if (!epochInfo) continue

      // Check if epoch is finalized and developer has contributions
      const devFp = BigInt(epochGame.total_fp_contributed)
      const totalGameFp = BigInt(epochInfo.total_game_fp)
      const devRewardPool = BigInt(epochInfo.dev_reward_pool)

      if (
        epochInfo.is_finalized &&
        devFp > 0n &&
        totalGameFp > 0n
      ) {
        // Calculate estimated dev reward: (dev_fp / total_game_fp) * dev_reward_pool
        const estimatedReward = (devFp * devRewardPool) / totalGameFp

        if (estimatedReward > 0n) {
          rewards.push({
            epoch,
            developerAddress,
            amount: estimatedReward,
            fpContributed: devFp,
          })
        }
      }
    } catch (error) {
      console.error(`Error parsing EpochGame for epoch ${epoch}:`, error)
    }
  }

  return rewards
}

// =============================================================================
// Game Info Queries
// =============================================================================

export interface GameInfo {
  developer: string
}

export interface GameStats {
  gameId: string
  developer: string
  totalFpContributed: bigint
}

/**
 * Get GameInfo (developer address) for a registered game
 */
export async function getGameInfo(gameId: string): Promise<GameInfo | null> {
  const rpcClient = getRpc()
  const contractId = CONFIG.ohlossContract

  try {
    const key = buildGameKey(gameId)
    const ledgerKey = storageKeyToLedgerKey(contractId, key, 'persistent')

    const response = await rpcClient.getLedgerEntries(ledgerKey)

    if (response.entries && response.entries.length > 0) {
      const entry = response.entries[0]
      const contractData = entry.val.contractData()
      const val = contractData.val()
      const native = scValToNative(val)

      return {
        developer: native.developer,
      }
    }

    return null
  } catch (error) {
    console.error(`Error fetching GameInfo for ${gameId}:`, error)
    return null
  }
}

/**
 * Get FP contributed for a game in the current epoch
 * Requires looking up the developer first, then querying EpochGame
 */
export async function getGameStats(gameId: string, epoch: number): Promise<GameStats | null> {
  try {
    // First get the developer address from GameInfo
    const gameInfo = await getGameInfo(gameId)
    if (!gameInfo) {
      console.log(`Game ${gameId} not found`)
      return null
    }

    const rpcClient = getRpc()
    const contractId = CONFIG.ohlossContract

    // Now query EpochGame using the developer address
    const key = buildEpochGameKey(epoch, gameInfo.developer)
    const ledgerKey = storageKeyToLedgerKey(contractId, key, 'temporary')

    const response = await rpcClient.getLedgerEntries(ledgerKey)

    if (response.entries && response.entries.length > 0) {
      const entry = response.entries[0]
      const contractData = entry.val.contractData()
      const val = contractData.val()
      const native = scValToNative(val)

      return {
        gameId,
        developer: gameInfo.developer,
        totalFpContributed: BigInt(native.total_fp_contributed || 0),
      }
    }

    // Game exists but no contributions this epoch
    return {
      gameId,
      developer: gameInfo.developer,
      totalFpContributed: 0n,
    }
  } catch (error) {
    console.error(`Error fetching GameStats for ${gameId}:`, error)
    return null
  }
}

// =============================================================================
// Formatting Utilities
// =============================================================================

export const SCALAR_7 = 10_000_000n

/**
 * Format a 7-decimal fixed point number to display string
 * Uses truncation (not rounding) to never show more than actual value
 */
export function formatUSDC(amount: bigint, decimals = 4): string {
  const whole = amount / SCALAR_7
  const fraction = amount % SCALAR_7
  const fractionStr = fraction.toString().padStart(7, '0').slice(0, decimals)
  return `${whole.toLocaleString()}.${fractionStr}`
}

/**
 * Parse a display string to 7-decimal fixed point
 */
export function parseUSDCInput(amount: string): bigint {
  const [whole, fraction = ''] = amount.split('.')
  const wholeNum = BigInt(whole || '0')
  const fractionPadded = fraction.padEnd(7, '0').slice(0, 7)
  return wholeNum * SCALAR_7 + BigInt(fractionPadded)
}

/**
 * Format XLM (7 decimals like USDC on Stellar)
 */
export function formatXLM(amount: bigint, decimals = 4): string {
  return formatUSDC(amount, decimals)
}

// Export config for use elsewhere
export { CONFIG }
