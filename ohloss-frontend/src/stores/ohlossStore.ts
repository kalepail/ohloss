// Ohloss protocol state management
// Handles all contract data fetching, caching, and actions

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  getRpc,
  STELLAR_CONFIG,
  buildStorageKey,
  storageKeyToLedgerKey,
  batchGetLedgerEntriesOrdered,
  parseEpochInfo,
  parseEpochPlayer,
  parsePlayer,
  parseEpochGame,
  getAllBalances,
  getPlayerDataAndBalances,
  type EpochInfo,
  type EpochPlayer,
  type Player,
  type OhlossConfig,
} from '@/lib/stellar'
import {
  calculateAmountMultiplier,
  calculateTimeMultiplier,
} from '@/lib/multipliers'
import { xdr, scValToNative, Address } from '@stellar/stellar-sdk'

// =============================================================================
// Types
// =============================================================================

export interface ClaimableReward {
  epoch: number
  amount: bigint // Estimated claimable amount
  faction: number
  isWinningFaction: boolean
  fpContributed: bigint
}

export interface DevClaimableReward {
  epoch: number
  developerAddress: string
  amount: bigint // Estimated claimable amount
  fpContributed: bigint
}

interface OhlossState {
  // User preferences (persisted)
  isPlayer: boolean
  isDeveloper: boolean

  // Protocol data
  config: OhlossConfig | null
  currentEpoch: number | null
  currentEpochInfo: EpochInfo | null

  // Player data
  player: Player | null
  epochPlayer: EpochPlayer | null

  // Balances
  xlmBalance: bigint
  usdcBalance: bigint
  vaultBalance: bigint

  // Multipliers (calculated)
  amountMultiplier: number
  timeMultiplier: number

  // Claimable rewards
  playerRewards: ClaimableReward[]
  devRewards: DevClaimableReward[]

  // Loading states
  isLoading: boolean
  isLoadingRewards: boolean
  isRefreshingBalances: boolean
  error: string | null

  // Actions
  setIsPlayer: (value: boolean) => void
  setIsDeveloper: (value: boolean) => void
  fetchProtocolData: () => Promise<void>
  fetchPlayerData: (address: string) => Promise<void>
  fetchBalances: (address: string) => Promise<void>
  /** Combined fetch for player data + balances in single RPC call */
  fetchAllPlayerData: (address: string) => Promise<void>
  /** Refresh balances only (for manual refresh buttons) */
  refreshBalances: (address: string) => Promise<void>
  /** Combined fetch for both player and dev rewards in single batch (shares EpochInfo data) */
  fetchAllRewards: (address: string, fetchPlayer: boolean, fetchDev: boolean) => Promise<void>
  /** Refresh faction standings and check for epoch changes. Returns true if epoch changed. */
  refreshFactionStandings: () => Promise<boolean>
  reset: () => void
}

// =============================================================================
// Constants
// =============================================================================

const EPOCHS_TO_FETCH = 100
const FACTION_NAMES = ['GildedFin', 'VerdantHollow', 'Wobblestone'] as const

// =============================================================================
// Store
// =============================================================================

const initialState = {
  isPlayer: true,
  isDeveloper: false,
  config: null,
  currentEpoch: null,
  currentEpochInfo: null,
  player: null,
  epochPlayer: null,
  xlmBalance: 0n,
  usdcBalance: 0n,
  vaultBalance: 0n,
  amountMultiplier: 1.0,
  timeMultiplier: 1.0,
  playerRewards: [],
  devRewards: [],
  isLoading: false,
  isLoadingRewards: false,
  isRefreshingBalances: false,
  error: null,
}

export const useOhlossStore = create<OhlossState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setIsPlayer: (value) => set({ isPlayer: value }),
      setIsDeveloper: (value) => set({ isDeveloper: value }),

      fetchProtocolData: async () => {
        set({ isLoading: true, error: null })

        try {
          const rpc = getRpc()
          const contractId = STELLAR_CONFIG.ohlossContract

          if (!contractId) {
            throw new Error('Ohloss contract address not configured')
          }

          // Fetch instance data which contains CurrentEpoch and Config
          const instanceKey = xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contract: new Address(contractId).toScAddress(),
              key: xdr.ScVal.scvLedgerKeyContractInstance(),
              durability: xdr.ContractDataDurability.persistent(),
            })
          )

          const instanceResponse = await rpc.getLedgerEntries(instanceKey)

          let currentEpoch = 0
          let config: OhlossConfig | null = null

          if (instanceResponse.entries && instanceResponse.entries.length > 0) {
            const entry = instanceResponse.entries[0]
            const contractData = entry.val.contractData()
            const instance = contractData.val().instance()
            const storage = instance.storage()

            if (storage) {
              for (const item of storage) {
                const key = item.key()
                const val = item.val()

                if (key.switch().name === 'scvVec') {
                  const vec = key.vec()
                  if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
                    const symbol = vec[0].sym().toString()

                    if (symbol === 'CurrentEpoch') {
                      currentEpoch = scValToNative(val) as number
                    } else if (symbol === 'Config') {
                      const native = scValToNative(val)
                      config = {
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
                    }
                  }
                }
              }
            }
          }

          // Note: EpochInfo is now fetched in fetchAllPlayerData to combine RPC calls
          // For logged-out users, we set currentEpochInfo to null (no epoch data displayed)
          set({
            currentEpoch,
            currentEpochInfo: null, // Will be populated by fetchAllPlayerData
            config,
            isLoading: false,
          })
        } catch (error) {
          console.error('Error fetching protocol data:', error)
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch protocol data',
            isLoading: false,
          })
        }
      },

      fetchPlayerData: async (address: string) => {
        const { currentEpoch } = get()

        if (currentEpoch === null) {
          console.warn('Cannot fetch player data: current epoch not loaded')
          return
        }

        try {
          const rpc = getRpc()
          const contractId = STELLAR_CONFIG.ohlossContract

          // Build both ledger keys
          const playerKey = buildStorageKey({ type: 'Player', address })
          const playerLedgerKey = storageKeyToLedgerKey(contractId, playerKey, 'persistent')

          const epochPlayerKey = buildStorageKey({
            type: 'EpochPlayer',
            epoch: currentEpoch,
            address,
          })
          const epochPlayerLedgerKey = storageKeyToLedgerKey(
            contractId,
            epochPlayerKey,
            'temporary'
          )

          // Single batched RPC call for both player and epochPlayer
          const response = await rpc.getLedgerEntries(playerLedgerKey, epochPlayerLedgerKey)

          let player: Player | null = null
          let epochPlayer: EpochPlayer | null = null

          // IMPORTANT: getLedgerEntries does NOT return entries in order and only returns found entries
          // We need to match entries by inspecting the key symbol
          if (response.entries) {
            for (const entry of response.entries) {
              try {
                const contractData = entry.val.contractData()
                const key = contractData.key()
                if (key.switch().name === 'scvVec') {
                  const vec = key.vec()
                  if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
                    const symbol = vec[0].sym().toString()
                    if (symbol === 'Player') {
                      player = parsePlayer(entry.val)
                    } else if (symbol === 'EpochPlayer') {
                      epochPlayer = parseEpochPlayer(entry.val)
                    }
                  }
                }
              } catch (e) {
                console.warn('Error parsing entry in fetchPlayerData:', e)
              }
            }
          }

          // Calculate multipliers
          let amountMultiplier = 1.0
          let timeMultiplier = 1.0

          const { vaultBalance } = get()
          if (vaultBalance > 0n) {
            amountMultiplier = calculateAmountMultiplier(vaultBalance)
          }

          if (player && player.timeMultiplierStart > 0n) {
            const now = BigInt(Math.floor(Date.now() / 1000))
            const timeHeld = now - player.timeMultiplierStart
            timeMultiplier = calculateTimeMultiplier(timeHeld)
          }

          set({
            player,
            epochPlayer,
            amountMultiplier,
            timeMultiplier,
          })
        } catch (error) {
          console.error('Error fetching player data:', error)
        }
      },

      fetchBalances: async (address: string) => {
        try {
          // Single batched RPC call for all balances
          const { xlmBalance, usdcBalance, vaultBalance } = await getAllBalances(address)

          // Recalculate amount multiplier with new vault balance
          const amountMultiplier = calculateAmountMultiplier(vaultBalance)

          set({
            xlmBalance,
            usdcBalance,
            vaultBalance,
            amountMultiplier,
          })
        } catch (error) {
          console.error('Error fetching balances:', error)
        }
      },

      fetchAllPlayerData: async (address: string) => {
        const { currentEpoch } = get()

        if (currentEpoch === null) {
          console.warn('Cannot fetch player data: current epoch not loaded')
          return
        }

        try {
          // Single batched RPC call for ALL player data, balances, AND epoch info
          const { player, epochPlayer, epochInfo, xlmBalance, usdcBalance, vaultBalance } =
            await getPlayerDataAndBalances(address, currentEpoch)

          // Calculate multipliers
          let amountMultiplier = 1.0
          let timeMultiplier = 1.0

          if (vaultBalance > 0n) {
            amountMultiplier = calculateAmountMultiplier(vaultBalance)
          }

          if (player && player.timeMultiplierStart > 0n) {
            const now = BigInt(Math.floor(Date.now() / 1000))
            const timeHeld = now - player.timeMultiplierStart
            timeMultiplier = calculateTimeMultiplier(timeHeld)
          }

          set({
            player,
            epochPlayer,
            currentEpochInfo: epochInfo,
            xlmBalance,
            usdcBalance,
            vaultBalance,
            amountMultiplier,
            timeMultiplier,
          })
        } catch (error) {
          console.error('Error fetching all player data:', error)
        }
      },

      refreshBalances: async (address: string) => {
        const { currentEpoch } = get()

        if (currentEpoch === null) {
          console.warn('Cannot refresh balances: current epoch not loaded')
          return
        }

        set({ isRefreshingBalances: true })

        try {
          // Single batched RPC call for ALL player data, balances, AND epoch info
          const { player, epochPlayer, epochInfo, xlmBalance, usdcBalance, vaultBalance } =
            await getPlayerDataAndBalances(address, currentEpoch)

          // Calculate multipliers
          let amountMultiplier = 1.0
          let timeMultiplier = 1.0

          if (vaultBalance > 0n) {
            amountMultiplier = calculateAmountMultiplier(vaultBalance)
          }

          if (player && player.timeMultiplierStart > 0n) {
            const now = BigInt(Math.floor(Date.now() / 1000))
            const timeHeld = now - player.timeMultiplierStart
            timeMultiplier = calculateTimeMultiplier(timeHeld)
          }

          set({
            player,
            epochPlayer,
            currentEpochInfo: epochInfo,
            xlmBalance,
            usdcBalance,
            vaultBalance,
            amountMultiplier,
            timeMultiplier,
            isRefreshingBalances: false,
          })
        } catch (error) {
          console.error('Error refreshing balances:', error)
          set({ isRefreshingBalances: false })
        }
      },

      fetchAllRewards: async (address: string, fetchPlayer: boolean, fetchDev: boolean) => {
        const { currentEpoch } = get()

        // Early exit if nothing to fetch
        if (!fetchPlayer && !fetchDev) {
          return
        }

        if (currentEpoch === null || currentEpoch < 1) {
          set({
            playerRewards: fetchPlayer ? [] : get().playerRewards,
            devRewards: fetchDev ? [] : get().devRewards,
          })
          return
        }

        set({ isLoadingRewards: true })

        try {
          const contractId = STELLAR_CONFIG.ohlossContract

          // Calculate epochs to fetch (last 100 finalized epochs)
          const startEpoch = Math.max(0, currentEpoch - EPOCHS_TO_FETCH)
          const epochsToFetch = currentEpoch - startEpoch

          // Build ledger keys - share EpochInfo across both player and dev rewards
          // Order: For each epoch: [EpochInfo, EpochPlayer?, Claimed?, EpochGame?, DevClaimed?]
          const keys: xdr.LedgerKey[] = []
          // Each type requires 2 keys (data + claimed status)
          const keysPerEpoch = 1 + (fetchPlayer ? 2 : 0) + (fetchDev ? 2 : 0)

          for (let epoch = startEpoch; epoch < currentEpoch; epoch++) {
            // Always fetch EpochInfo (shared between player and dev rewards)
            const epochKey = buildStorageKey({ type: 'Epoch', epoch })
            keys.push(storageKeyToLedgerKey(contractId, epochKey, 'temporary'))

            // EpochPlayer + Claimed keys (if fetching player rewards)
            if (fetchPlayer) {
              const epochPlayerKey = buildStorageKey({
                type: 'EpochPlayer',
                epoch,
                address,
              })
              keys.push(storageKeyToLedgerKey(contractId, epochPlayerKey, 'temporary'))

              // Claimed key to check if reward was already claimed
              const claimedKey = buildStorageKey({
                type: 'Claimed',
                address,
                epoch,
              })
              keys.push(storageKeyToLedgerKey(contractId, claimedKey, 'temporary'))
            }

            // EpochGame + DevClaimed keys (if fetching dev rewards)
            if (fetchDev) {
              const epochGameKey = buildStorageKey({
                type: 'EpochGame',
                epoch,
                address,
              })
              keys.push(storageKeyToLedgerKey(contractId, epochGameKey, 'temporary'))

              // DevClaimed key to check if dev reward was already claimed
              const devClaimedKey = buildStorageKey({
                type: 'DevClaimed',
                address,
                epoch,
              })
              keys.push(storageKeyToLedgerKey(contractId, devClaimedKey, 'temporary'))
            }
          }

          // Single batch fetch for all data
          const results = await batchGetLedgerEntriesOrdered(
            keys,
            (data) => data // Return raw data for custom parsing
          )

          // Process results
          const playerRewards: ClaimableReward[] = []
          const devRewards: DevClaimableReward[] = []

          for (let i = 0; i < epochsToFetch; i++) {
            const epoch = startEpoch + i
            const baseIdx = i * keysPerEpoch

            // Parse EpochInfo (always at baseIdx)
            const epochInfoData = results[baseIdx]
            if (!epochInfoData) continue

            const epochInfo = parseEpochInfo(epochInfoData)
            if (!epochInfo || !epochInfo.isFinalized) continue

            // Parse EpochPlayer and check Claimed status (if fetching player rewards)
            if (fetchPlayer) {
              const epochPlayerIdx = baseIdx + 1
              const claimedIdx = baseIdx + 2
              const epochPlayerData = results[epochPlayerIdx]
              const claimedData = results[claimedIdx]

              // Skip if already claimed (claimedData exists means reward was claimed)
              if (epochPlayerData && !claimedData) {
                const epochPlayer = parseEpochPlayer(epochPlayerData)
                if (
                  epochPlayer &&
                  epochInfo.winningFaction !== null &&
                  epochPlayer.epochFaction === epochInfo.winningFaction &&
                  epochPlayer.totalFpContributed > 0n
                ) {
                  const winningFactionFp = epochInfo.factionStandings.get(epochInfo.winningFaction) || 1n
                  const estimatedReward =
                    (epochPlayer.totalFpContributed * epochInfo.rewardPool) / winningFactionFp

                  playerRewards.push({
                    epoch,
                    amount: estimatedReward,
                    faction: epochPlayer.epochFaction,
                    isWinningFaction: true,
                    fpContributed: epochPlayer.totalFpContributed,
                  })
                }
              }
            }

            // Parse EpochGame and check DevClaimed status (if fetching dev rewards)
            if (fetchDev) {
              const epochGameIdx = baseIdx + (fetchPlayer ? 3 : 1)
              const devClaimedIdx = baseIdx + (fetchPlayer ? 4 : 2)
              const epochGameData = results[epochGameIdx]
              const devClaimedData = results[devClaimedIdx]

              // Skip if already claimed (devClaimedData exists means reward was claimed)
              if (epochGameData && !devClaimedData) {
                const epochGame = parseEpochGame(epochGameData)
                if (epochGame && epochGame.totalFpContributed > 0n && epochInfo.totalGameFp > 0n) {
                  const estimatedReward =
                    (epochGame.totalFpContributed * epochInfo.devRewardPool) / epochInfo.totalGameFp

                  if (estimatedReward > 0n) {
                    devRewards.push({
                      epoch,
                      developerAddress: address,
                      amount: estimatedReward,
                      fpContributed: epochGame.totalFpContributed,
                    })
                  }
                }
              }
            }
          }

          set({
            playerRewards: fetchPlayer ? playerRewards : get().playerRewards,
            devRewards: fetchDev ? devRewards : get().devRewards,
            isLoadingRewards: false,
          })
        } catch (error) {
          console.error('Error fetching rewards:', error)
          set({
            playerRewards: fetchPlayer ? [] : get().playerRewards,
            devRewards: fetchDev ? [] : get().devRewards,
            isLoadingRewards: false,
          })
        }
      },

      refreshFactionStandings: async () => {
        const { currentEpoch: storedEpoch } = get()

        if (storedEpoch === null) return false

        try {
          const rpc = getRpc()
          const contractId = STELLAR_CONFIG.ohlossContract

          if (!contractId) return false

          // First, check if the epoch has changed by reading from contract instance
          const instanceKey = xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contract: new Address(contractId).toScAddress(),
              key: xdr.ScVal.scvLedgerKeyContractInstance(),
              durability: xdr.ContractDataDurability.persistent(),
            })
          )

          const instanceResponse = await rpc.getLedgerEntries(instanceKey)

          let latestEpoch = storedEpoch

          if (instanceResponse.entries && instanceResponse.entries.length > 0) {
            const entry = instanceResponse.entries[0]
            const contractData = entry.val.contractData()
            const instance = contractData.val().instance()
            const storage = instance.storage()

            if (storage) {
              for (const item of storage) {
                const key = item.key()
                const val = item.val()

                if (key.switch().name === 'scvVec') {
                  const vec = key.vec()
                  if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
                    const symbol = vec[0].sym().toString()
                    if (symbol === 'CurrentEpoch') {
                      latestEpoch = scValToNative(val) as number
                      break
                    }
                  }
                }
              }
            }
          }

          const epochChanged = latestEpoch !== storedEpoch

          // Fetch the current (or new) epoch info
          const epochKey = buildStorageKey({ type: 'Epoch', epoch: latestEpoch })
          const epochLedgerKey = storageKeyToLedgerKey(contractId, epochKey, 'temporary')
          const epochResponse = await rpc.getLedgerEntries(epochLedgerKey)

          if (epochResponse.entries && epochResponse.entries.length > 0) {
            const currentEpochInfo = parseEpochInfo(epochResponse.entries[0].val)
            set({
              currentEpoch: latestEpoch,
              currentEpochInfo,
            })
          } else if (epochChanged) {
            // Epoch changed but no info yet - still update the epoch number
            set({ currentEpoch: latestEpoch })
          }

          return epochChanged
        } catch (error) {
          console.error('Error refreshing faction standings:', error)
          return false
        }
      },

      reset: () => {
        set({
          ...initialState,
          // Preserve user preferences
          isPlayer: get().isPlayer,
          isDeveloper: get().isDeveloper,
        })
      },
    }),
    {
      name: 'ohloss-preferences',
      partialize: (state) => ({
        isPlayer: state.isPlayer,
        isDeveloper: state.isDeveloper,
      }),
    }
  )
)

// =============================================================================
// Selectors
// =============================================================================

export const FACTION_SYMBOLS = ['𓆛', '𓆣', '𓅣'] as const
export { FACTION_NAMES }

export function getFactionName(factionId: number): string {
  return FACTION_NAMES[factionId] || 'Unknown'
}

export function getFactionSymbol(factionId: number): string {
  return FACTION_SYMBOLS[factionId] || '?'
}

/**
 * Calculate time remaining until epoch ends
 */
export function getEpochTimeRemaining(epochInfo: EpochInfo | null): number {
  if (!epochInfo) return 0
  const now = Math.floor(Date.now() / 1000)
  const endTime = Number(epochInfo.endTime)
  return Math.max(0, endTime - now)
}

/**
 * Check if epoch can be cycled (time has passed)
 */
export function canCycleEpoch(epochInfo: EpochInfo | null): boolean {
  if (!epochInfo) return false
  const now = Math.floor(Date.now() / 1000)
  return now >= Number(epochInfo.endTime) && !epochInfo.isFinalized
}

/**
 * Format time remaining as human readable string
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Epoch ended'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

/**
 * Calculate total claimable player rewards
 */
export function getTotalPlayerRewards(rewards: ClaimableReward[]): bigint {
  return rewards.reduce((sum, r) => sum + r.amount, 0n)
}

/**
 * Calculate total claimable dev rewards
 */
export function getTotalDevRewards(rewards: DevClaimableReward[]): bigint {
  return rewards.reduce((sum, r) => sum + r.amount, 0n)
}
