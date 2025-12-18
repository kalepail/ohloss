// Stellar RPC utilities and contract helpers
// Uses @stellar/stellar-sdk for all Soroban interactions

import {
  rpc,
  xdr,
  Address,
  scValToNative,
} from '@stellar/stellar-sdk'
import { Client as FeeVaultClient } from 'fee-vault'

const { Server: RpcServer } = rpc

// Configuration from environment
export const STELLAR_CONFIG = {
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  blendizzardContract: import.meta.env.VITE_BLENDIZZARD_CONTRACT || '',
  feeVaultContract: import.meta.env.VITE_FEE_VAULT_CONTRACT || '',
  usdcTokenContract: import.meta.env.VITE_USDC_TOKEN_CONTRACT || '',
  nativeTokenContract: import.meta.env.VITE_NATIVE_TOKEN_CONTRACT || '',
}

// Singleton RPC instance
let rpcInstance: InstanceType<typeof RpcServer> | null = null

export function getRpc(): InstanceType<typeof RpcServer> {
  if (!rpcInstance) {
    rpcInstance = new RpcServer(STELLAR_CONFIG.rpcUrl)
  }
  return rpcInstance
}

// Singleton FeeVault client for read-only operations
let feeVaultClient: FeeVaultClient | null = null

function getFeeVaultClient(): FeeVaultClient {
  if (!feeVaultClient) {
    feeVaultClient = new FeeVaultClient({
      contractId: STELLAR_CONFIG.feeVaultContract,
      networkPassphrase: STELLAR_CONFIG.networkPassphrase,
      rpcUrl: STELLAR_CONFIG.rpcUrl,
    })
  }
  return feeVaultClient
}

/**
 * Get a user's underlying token balance from the fee vault
 * This returns the actual USDC value, not the vault shares
 */
export async function getVaultUnderlyingBalance(address: string): Promise<bigint> {
  try {
    const client = getFeeVaultClient()
    const tx = await client.get_underlying_tokens({ user: address })
    const result = await tx.simulate()
    return BigInt(result.result)
  } catch (error) {
    console.error('Error fetching vault underlying balance:', error)
    return 0n
  }
}

// =============================================================================
// Contract Storage Key Builders
// =============================================================================
// These match the DataKey enum in contracts/blendizzard/src/storage.rs

/**
 * Build a contract storage key for the Blendizzard contract
 * Storage keys match the DataKey enum in the Rust contract
 */
export function buildStorageKey(dataKey: BlendizzardDataKey): xdr.ScVal {
  switch (dataKey.type) {
    case 'Admin':
      return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Admin')])

    case 'Config':
      return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Config')])

    case 'CurrentEpoch':
      return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('CurrentEpoch')])

    case 'Paused':
      return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Paused')])

    case 'Player':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Player'),
        new Address(dataKey.address).toScVal(),
      ])

    case 'EpochPlayer':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('EpochPlayer'),
        xdr.ScVal.scvU32(dataKey.epoch),
        new Address(dataKey.address).toScVal(),
      ])

    case 'Epoch':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Epoch'),
        xdr.ScVal.scvU32(dataKey.epoch),
      ])

    case 'Session':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Session'),
        xdr.ScVal.scvU32(dataKey.sessionId),
      ])

    case 'Game':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Game'),
        new Address(dataKey.address).toScVal(),
      ])

    case 'EpochGame':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('EpochGame'),
        xdr.ScVal.scvU32(dataKey.epoch),
        new Address(dataKey.address).toScVal(),
      ])

    case 'Claimed':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Claimed'),
        new Address(dataKey.address).toScVal(),
        xdr.ScVal.scvU32(dataKey.epoch),
      ])

    case 'DevClaimed':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('DevClaimed'),
        new Address(dataKey.address).toScVal(),
        xdr.ScVal.scvU32(dataKey.epoch),
      ])

    default:
      throw new Error(`Unknown data key type`)
  }
}

// DataKey types matching the Rust contract
export type BlendizzardDataKey =
  | { type: 'Admin' }
  | { type: 'Config' }
  | { type: 'CurrentEpoch' }
  | { type: 'Paused' }
  | { type: 'Player'; address: string }
  | { type: 'EpochPlayer'; epoch: number; address: string }
  | { type: 'Epoch'; epoch: number }
  | { type: 'Session'; sessionId: number }
  | { type: 'Game'; address: string }
  | { type: 'EpochGame'; epoch: number; address: string }
  | { type: 'Claimed'; address: string; epoch: number }
  | { type: 'DevClaimed'; address: string; epoch: number }

/**
 * Convert a storage key to a ledger key for getLedgerEntries
 */
export function storageKeyToLedgerKey(
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
// Batched getLedgerEntries
// =============================================================================

const MAX_LEDGER_ENTRIES_PER_REQUEST = 200

/**
 * Fetch multiple ledger entries in batched requests (max 200 per request)
 * Returns a map of key index to parsed value
 *
 * IMPORTANT: getLedgerEntries does NOT return entries in order and only returns found entries.
 * We match returned entries to original keys using XDR base64 comparison.
 */
export async function batchGetLedgerEntries<T>(
  keys: xdr.LedgerKey[],
  parser: (entry: xdr.LedgerEntryData | null) => T | null
): Promise<Map<number, T>> {
  const rpcClient = getRpc()
  const results = new Map<number, T>()

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

      // Match each returned entry to its original key by XDR comparison
      if (response.entries) {
        for (const entry of response.entries) {
          const entryKeyB64 = entry.key.toXDR('base64')
          const originalIndex = keyB64ToIndex.get(entryKeyB64)
          if (originalIndex !== undefined) {
            const parsed = parser(entry.val)
            if (parsed !== null) {
              results.set(originalIndex, parsed)
            }
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
 * Fetch ledger entries and return them in order, with nulls for missing entries
 *
 * IMPORTANT: Stellar RPC getLedgerEntries only returns found entries (missing keys
 * are omitted, not returned as null), and order is not guaranteed. This function
 * matches returned entries to their original keys by comparing the key field.
 */
export async function batchGetLedgerEntriesOrdered<T>(
  keys: xdr.LedgerKey[],
  parser: (entry: xdr.LedgerEntryData | null) => T | null
): Promise<(T | null)[]> {
  const rpcClient = getRpc()
  const results: (T | null)[] = new Array(keys.length).fill(null)

  // Convert keys to base64 for matching (since getLedgerEntries returns keys in XDR format)
  const keyB64Map = new Map<string, number>()
  keys.forEach((key, index) => {
    keyB64Map.set(key.toXDR('base64'), index)
  })

  // Split into batches of 200
  for (let i = 0; i < keys.length; i += MAX_LEDGER_ENTRIES_PER_REQUEST) {
    const batch = keys.slice(i, i + MAX_LEDGER_ENTRIES_PER_REQUEST)

    try {
      const response = await rpcClient.getLedgerEntries(...batch)

      // Match each returned entry to its original key position
      if (response.entries) {
        for (const entry of response.entries) {
          // The entry has a 'key' field that matches the original requested key
          const entryKeyB64 = entry.key.toXDR('base64')
          const originalIndex = keyB64Map.get(entryKeyB64)
          if (originalIndex !== undefined) {
            results[originalIndex] = parser(entry.val)
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching ledger entries batch ${i}:`, error)
    }
  }

  return results
}

// =============================================================================
// Contract Data Parsers
// =============================================================================

/**
 * Parse EpochInfo from contract data
 */
export function parseEpochInfo(data: xdr.LedgerEntryData | null): EpochInfo | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    const native = scValToNative(val)

    return {
      startTime: BigInt(native.start_time),
      endTime: BigInt(native.end_time),
      factionStandings: new Map(
        Object.entries(native.faction_standings || {}).map(([k, v]) => [
          Number(k),
          BigInt(v as string | number),
        ])
      ),
      rewardPool: BigInt(native.reward_pool),
      winningFaction: native.winning_faction ?? null,
      isFinalized: native.is_finalized,
      totalGameFp: BigInt(native.total_game_fp),
      devRewardPool: BigInt(native.dev_reward_pool),
    }
  } catch (error) {
    console.error('Error parsing EpochInfo:', error)
    return null
  }
}

/**
 * Parse EpochPlayer from contract data
 */
export function parseEpochPlayer(data: xdr.LedgerEntryData | null): EpochPlayer | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    const native = scValToNative(val)

    return {
      epochFaction: native.epoch_faction ?? null,
      epochBalanceSnapshot: BigInt(native.epoch_balance_snapshot),
      availableFp: BigInt(native.available_fp),
      totalFpContributed: BigInt(native.total_fp_contributed),
    }
  } catch (error) {
    console.error('Error parsing EpochPlayer:', error)
    return null
  }
}

/**
 * Parse Player from contract data
 */
export function parsePlayer(data: xdr.LedgerEntryData | null): Player | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    const native = scValToNative(val)

    return {
      selectedFaction: native.selected_faction,
      timeMultiplierStart: BigInt(native.time_multiplier_start),
      lastEpochBalance: BigInt(native.last_epoch_balance),
    }
  } catch (error) {
    console.error('Error parsing Player:', error)
    return null
  }
}

/**
 * Parse Config from contract data
 */
export function parseConfig(data: xdr.LedgerEntryData | null): BlendizzardConfig | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    const native = scValToNative(val)

    return {
      feeVault: native.fee_vault,
      soroswapRouter: native.soroswap_router,
      blndToken: native.blnd_token,
      usdcToken: native.usdc_token,
      epochDuration: BigInt(native.epoch_duration),
      reserveTokenIds: native.reserve_token_ids || [],
      freeFpPerEpoch: BigInt(native.free_fp_per_epoch),
      minDepositToClaim: BigInt(native.min_deposit_to_claim),
      devRewardShare: BigInt(native.dev_reward_share),
    }
  } catch (error) {
    console.error('Error parsing Config:', error)
    return null
  }
}

/**
 * Parse a simple u32 value (like CurrentEpoch)
 */
export function parseU32(data: xdr.LedgerEntryData | null): number | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    return scValToNative(val) as number
  } catch (error) {
    console.error('Error parsing u32:', error)
    return null
  }
}

/**
 * Parse a boolean value
 */
export function parseBool(data: xdr.LedgerEntryData | null): boolean | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    return scValToNative(val) as boolean
  } catch (error) {
    console.error('Error parsing bool:', error)
    return null
  }
}

/**
 * Parse EpochGame from contract data
 */
export function parseEpochGame(data: xdr.LedgerEntryData | null): EpochGame | null {
  if (!data) return null

  try {
    const contractData = data.contractData()
    const val = contractData.val()
    const native = scValToNative(val)

    return {
      totalFpContributed: BigInt(native.total_fp_contributed),
    }
  } catch (error) {
    console.error('Error parsing EpochGame:', error)
    return null
  }
}

// =============================================================================
// Token Balance Helpers
// =============================================================================

/**
 * Build a token balance ledger key
 */
export function buildTokenBalanceKey(tokenContract: string, address: string): xdr.LedgerKey {
  const balanceKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Balance'),
    new Address(address).toScVal(),
  ])
  return storageKeyToLedgerKey(tokenContract, balanceKey, 'persistent')
}

/**
 * Build a vault shares ledger key
 */
export function buildVaultSharesKey(address: string): xdr.LedgerKey {
  const sharesKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Shares'),
    new Address(address).toScVal(),
  ])
  return storageKeyToLedgerKey(STELLAR_CONFIG.feeVaultContract, sharesKey, 'persistent')
}

/**
 * Parse i128 balance from ledger entry
 * Handles both raw i128 values and SEP-41 balance maps {amount, authorized, clawback}
 */
export function parseI128Balance(data: xdr.LedgerEntryData | null): bigint {
  if (!data) return 0n

  try {
    const contractData = data.contractData()
    const val = contractData.val()

    if (val.switch().name === 'scvI128') {
      const i128 = val.i128()
      const lo = BigInt(i128.lo().toString())
      const hi = BigInt(i128.hi().toString())
      return (hi << 64n) | lo
    }

    // Try scValToNative for other formats (maps, etc)
    const native = scValToNative(val)

    // SEP-41 tokens return a map with {amount, authorized, clawback}
    if (native && typeof native === 'object' && 'amount' in native) {
      return BigInt(native.amount)
    }

    // Direct numeric value
    if (typeof native === 'bigint') {
      return native
    }
    if (typeof native === 'number' || typeof native === 'string') {
      return BigInt(native)
    }

    return 0n
  } catch (e) {
    console.warn('Error parsing i128 balance:', e)
    return 0n
  }
}

/**
 * Get all balances for an address
 * Returns { xlmBalance, usdcBalance, vaultBalance }
 *
 * Note: vaultBalance is fetched via contract simulation (get_underlying_tokens)
 * to get the actual USDC value, not just the share count.
 */
export async function getAllBalances(address: string): Promise<{
  xlmBalance: bigint
  usdcBalance: bigint
  vaultBalance: bigint
}> {
  const rpcClient = getRpc()

  try {
    // Build ledger keys for token balances
    const keys = [
      buildTokenBalanceKey(STELLAR_CONFIG.nativeTokenContract, address),
      buildTokenBalanceKey(STELLAR_CONFIG.usdcTokenContract, address),
    ]

    // Fetch token balances and vault underlying balance in parallel
    const [ledgerResponse, vaultBalance] = await Promise.all([
      rpcClient.getLedgerEntries(...keys),
      getVaultUnderlyingBalance(address),
    ])

    let xlmBalance = 0n
    let usdcBalance = 0n

    if (ledgerResponse.entries) {
      // getLedgerEntries only returns existing entries, not in order
      // We need to match by contract address in the returned key
      for (const entry of ledgerResponse.entries) {
        try {
          const contractData = entry.val.contractData()
          const contractAddress = Address.fromScAddress(contractData.contract()).toString()

          if (contractAddress === STELLAR_CONFIG.nativeTokenContract) {
            xlmBalance = parseI128Balance(entry.val)
          } else if (contractAddress === STELLAR_CONFIG.usdcTokenContract) {
            usdcBalance = parseI128Balance(entry.val)
          }
        } catch (e) {
          // Entry might not be contract data, skip it
          console.warn('Error parsing entry contract address:', e)
        }
      }
    }

    return { xlmBalance, usdcBalance, vaultBalance }
  } catch (error) {
    console.error('Error fetching balances:', error)
    return { xlmBalance: 0n, usdcBalance: 0n, vaultBalance: 0n }
  }
}

/**
 * Get all player data, balances, and current epoch info in a single RPC call
 * This combines player, epochPlayer, epochInfo, and all balances into one request
 *
 * Note: vaultBalance is fetched via contract simulation (get_underlying_tokens)
 * to get the actual USDC value, not just the share count.
 */
export async function getPlayerDataAndBalances(
  address: string,
  currentEpoch: number
): Promise<{
  player: Player | null
  epochPlayer: EpochPlayer | null
  epochInfo: EpochInfo | null
  xlmBalance: bigint
  usdcBalance: bigint
  vaultBalance: bigint
}> {
  const rpcClient = getRpc()
  const contractId = STELLAR_CONFIG.blendizzardContract

  try {
    // Build ledger keys for player data, epoch info, and token balances
    const playerKey = buildStorageKey({ type: 'Player', address })
    const playerLedgerKey = storageKeyToLedgerKey(contractId, playerKey, 'persistent')

    const epochPlayerKey = buildStorageKey({
      type: 'EpochPlayer',
      epoch: currentEpoch,
      address,
    })
    const epochPlayerLedgerKey = storageKeyToLedgerKey(contractId, epochPlayerKey, 'temporary')

    // Add EpochInfo key to combine fetches
    const epochInfoKey = buildStorageKey({ type: 'Epoch', epoch: currentEpoch })
    const epochInfoLedgerKey = storageKeyToLedgerKey(contractId, epochInfoKey, 'temporary')

    const keys = [
      playerLedgerKey,
      epochPlayerLedgerKey,
      epochInfoLedgerKey,
      buildTokenBalanceKey(STELLAR_CONFIG.nativeTokenContract, address),
      buildTokenBalanceKey(STELLAR_CONFIG.usdcTokenContract, address),
    ]

    // Fetch ledger entries and vault underlying balance in parallel
    const [ledgerResponse, vaultBalance] = await Promise.all([
      rpcClient.getLedgerEntries(...keys),
      getVaultUnderlyingBalance(address),
    ])

    let player: Player | null = null
    let epochPlayer: EpochPlayer | null = null
    let epochInfo: EpochInfo | null = null
    let xlmBalance = 0n
    let usdcBalance = 0n

    if (ledgerResponse.entries) {
      // getLedgerEntries only returns existing entries, not in order
      // We need to match by contract address in the returned key
      for (const entry of ledgerResponse.entries) {
        try {
          const contractData = entry.val.contractData()
          const contractAddress = Address.fromScAddress(contractData.contract()).toString()

          if (contractAddress === contractId) {
            // This is from blendizzard contract - check the key to determine type
            const key = contractData.key()
            if (key.switch().name === 'scvVec') {
              const vec = key.vec()
              if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
                const symbol = vec[0].sym().toString()
                if (symbol === 'Player') {
                  player = parsePlayer(entry.val)
                } else if (symbol === 'EpochPlayer') {
                  epochPlayer = parseEpochPlayer(entry.val)
                } else if (symbol === 'Epoch') {
                  epochInfo = parseEpochInfo(entry.val)
                }
              }
            }
          } else if (contractAddress === STELLAR_CONFIG.nativeTokenContract) {
            xlmBalance = parseI128Balance(entry.val)
          } else if (contractAddress === STELLAR_CONFIG.usdcTokenContract) {
            usdcBalance = parseI128Balance(entry.val)
          }
        } catch (e) {
          // Entry might not be contract data, skip it
          console.warn('Error parsing entry:', e)
        }
      }
    }

    return { player, epochPlayer, epochInfo, xlmBalance, usdcBalance, vaultBalance }
  } catch (error) {
    console.error('Error fetching player data and balances:', error)
    return {
      player: null,
      epochPlayer: null,
      epochInfo: null,
      xlmBalance: 0n,
      usdcBalance: 0n,
      vaultBalance: 0n,
    }
  }
}

/**
 * Get token balance for an address (legacy single-call version)
 * Prefer getAllBalances() for batched fetching
 */
export async function getTokenBalance(
  tokenContract: string,
  address: string
): Promise<bigint> {
  const rpcClient = getRpc()

  try {
    const ledgerKey = buildTokenBalanceKey(tokenContract, address)
    const response = await rpcClient.getLedgerEntries(ledgerKey)

    if (response.entries && response.entries.length > 0) {
      return parseI128Balance(response.entries[0].val)
    }

    return 0n
  } catch (error) {
    console.error('Error fetching token balance:', error)
    return 0n
  }
}

/**
 * Get vault balance (legacy single-call version)
 * Prefer getAllBalances() for batched fetching
 */
export async function getVaultBalance(address: string): Promise<bigint> {
  const rpcClient = getRpc()

  try {
    const ledgerKey = buildVaultSharesKey(address)
    const response = await rpcClient.getLedgerEntries(ledgerKey)

    if (response.entries && response.entries.length > 0) {
      return parseI128Balance(response.entries[0].val)
    }

    return 0n
  } catch (error) {
    console.error('Error fetching vault balance:', error)
    return 0n
  }
}

// =============================================================================
// Type Definitions
// =============================================================================

export interface EpochInfo {
  startTime: bigint
  endTime: bigint
  factionStandings: Map<number, bigint>
  rewardPool: bigint
  winningFaction: number | null
  isFinalized: boolean
  totalGameFp: bigint
  devRewardPool: bigint
}

export interface EpochPlayer {
  epochFaction: number | null
  epochBalanceSnapshot: bigint
  availableFp: bigint
  totalFpContributed: bigint
}

export interface Player {
  selectedFaction: number
  timeMultiplierStart: bigint
  lastEpochBalance: bigint
}

export interface BlendizzardConfig {
  feeVault: string
  soroswapRouter: string
  blndToken: string
  usdcToken: string
  epochDuration: bigint
  reserveTokenIds: number[]
  freeFpPerEpoch: bigint
  minDepositToClaim: bigint
  devRewardShare: bigint
}

export interface EpochGame {
  totalFpContributed: bigint
}

// =============================================================================
// Formatting Helpers
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
export function parseUSDC(amount: string): bigint {
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
