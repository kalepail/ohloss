import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore } from '@/stores/walletStore'
import { Checkbox } from '@/components/ui'
import {
  useBlendizzardStore,
  getFactionName,
  getFactionSymbol,
  getEpochTimeRemaining,
  canCycleEpoch,
  formatTimeRemaining,
  getTotalPlayerRewards,
  getTotalDevRewards,
} from '@/stores/blendizzardStore'

// Refresh icon component
function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  )
}
import { disconnect as disconnectWallet, connectWallet } from '@/lib/smartAccount'
import {
  formatUSDC,
  formatXLM,
  parseUSDCInput,
  cycleEpoch,
  selectFaction,
  depositToVault,
  withdrawFromVault,
  claimEpochReward,
  claimDevReward,
} from '@/lib/contractService'
import { AsciiBackground } from './AsciiBackground'
import { AsciiLoader } from './AsciiLoader'
import { SwapPanel } from './SwapPanel'

/**
 * Calculate potential FP a player would have if they started a game
 * Formula: free_fp + (vault_balance * 100 * amount_mult * time_mult)
 *
 * All values use 7 decimal scaling (SCALAR_7 = 10_000_000)
 * - vault_balance: 22199997 = 2.2199997 USDC
 * - freeFpPerEpoch: 1000000000 = 100 FP
 * - Result: 3219999700 = ~322 FP
 */
function calculatePotentialFp(
  vaultBalance: bigint,
  amountMultiplier: number,
  timeMultiplier: number,
  freeFpPerEpoch: bigint
): bigint {
  // If no vault balance, just return free FP
  if (vaultBalance <= 0n) {
    return freeFpPerEpoch
  }

  // deposit_fp = vault_balance * 100 (base FP per USDC) * amount_mult * time_mult
  // vault_balance is in 7 decimals, baseFp stays in 7 decimals (100 FP per 1 USDC)
  const baseFp = vaultBalance * 100n
  const combinedMult = amountMultiplier * timeMultiplier
  // Don't divide by SCALAR_7 - the result should stay in 7 decimal format
  const depositFp = BigInt(Math.floor(Number(baseFp) * combinedMult))

  return freeFpPerEpoch + depositFp
}

// Default free FP per epoch (100 FP with 7 decimals = 1,000,000,000)
const DEFAULT_FREE_FP = 1_000_000_000n

// Mock game library data
const MOCK_GAMES = [
  { id: 'coin-flip', name: 'COIN FLIP', status: 'LIVE', players: 142 },
  { id: 'rock-paper-scissors', name: 'RPS DUEL', status: 'LIVE', players: 89 },
  { id: 'dice-roll', name: 'DICE ROLL', status: 'COMING SOON', players: 0 },
]

export function AccountPage() {
  const navigate = useNavigate()
  const { address, setAddress, disconnect } = useWalletStore()
  const [isRestoring, setIsRestoring] = useState(true)
  const {
    // User preferences
    isPlayer,
    isDeveloper,
    setIsPlayer,
    setIsDeveloper,
    // Protocol data
    config,
    currentEpoch,
    currentEpochInfo,
    // Player data
    player,
    epochPlayer,
    // Balances
    xlmBalance,
    usdcBalance,
    vaultBalance,
    // Multipliers
    amountMultiplier,
    timeMultiplier,
    // Rewards
    playerRewards,
    devRewards,
    // Loading
    isLoadingRewards,
    isRefreshingBalances,
    // Actions
    fetchProtocolData,
    fetchAllPlayerData,
    refreshBalances,
    fetchAllRewards,
    refreshFactionStandings,
    reset,
  } = useBlendizzardStore()

  // Local state
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [showGameLibrary, setShowGameLibrary] = useState(false)
  const [pendingFaction, setPendingFaction] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [addressCopied, setAddressCopied] = useState(false)


  // Try to restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      if (!address) {
        try {
          const result = await connectWallet()
          if (result) {
            setAddress(result.contractId)
          } else {
            // No session found, redirect to home
            navigate('/')
          }
        } catch (err) {
          console.error('Failed to restore session:', err)
          // Session is already cleared by connectWallet() when contract not found
          navigate('/')
        }
      }
      setIsRestoring(false)
    }
    restoreSession()
  }, [address, setAddress, navigate])

  // Guard ref for initial protocol fetch (React Strict Mode)
  const protocolFetchedRef = useRef(false)

  // Initial data fetch (with guard for React Strict Mode)
  useEffect(() => {
    if (protocolFetchedRef.current) return
    protocolFetchedRef.current = true
    fetchProtocolData()
  }, [fetchProtocolData])

  // Fetch player data when address or epoch changes
  useEffect(() => {
    if (!address || currentEpoch === null) return
    fetchAllPlayerData(address)
  }, [address, currentEpoch, fetchAllPlayerData])

  // Fetch rewards when enabled
  useEffect(() => {
    if (!address || currentEpoch === null || (!isPlayer && !isDeveloper)) return
    fetchAllRewards(address, isPlayer, isDeveloper)
  }, [address, isPlayer, isDeveloper, currentEpoch, fetchAllRewards])

  // Countdown timer
  useEffect(() => {
    const updateTimer = () => {
      setTimeRemaining(getEpochTimeRemaining(currentEpochInfo))
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [currentEpochInfo])

  // Auto-refresh faction standings every 30 seconds and detect epoch changes
  useEffect(() => {
    const interval = setInterval(async () => {
      const epochChanged = await refreshFactionStandings()
      if (epochChanged && address && (isPlayer || isDeveloper)) {
        // Epoch changed - refresh rewards and player data
        fetchAllRewards(address, isPlayer, isDeveloper)
        fetchAllPlayerData(address)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [refreshFactionStandings, address, isPlayer, isDeveloper, fetchAllRewards, fetchAllPlayerData])

  const handleDisconnect = async () => {
    await disconnectWallet()
    disconnect()
    reset()
    navigate('/')
  }

  const truncateAddress = (addr: string) => {
    if (addr.length <= 16) return addr
    return `${addr.slice(0, 8)}...${addr.slice(-8)}`
  }

  const handleCopyAddress = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setAddressCopied(true)
      setTimeout(() => setAddressCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy address:', err)
    }
  }

  const clearMessages = () => {
    setActionError(null)
    setActionSuccess(null)
  }

  const handleRefreshBalances = () => {
    if (address && !isRefreshingBalances) {
      refreshBalances(address)
    }
  }

  // ===========================================
  // Action Handlers
  // ===========================================

  const handleCycleEpoch = async () => {
    if (!address) return
    clearMessages()
    setIsSubmitting(true)
    try {
      const result = await cycleEpoch()
      if (result.success) {
        setActionSuccess(`Epoch cycled! New epoch: ${result.newEpoch}`)
        fetchProtocolData()
        // Refresh rewards after epoch cycle
        if (isPlayer || isDeveloper) {
          fetchAllRewards(address, isPlayer, isDeveloper)
        }
        // Refresh player data for new epoch
        fetchAllPlayerData(address)
      } else {
        setActionError(result.error || 'Failed to cycle epoch')
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cycle epoch')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectFaction = async (faction: number) => {
    if (!address) return
    clearMessages()
    setIsSubmitting(true)
    setPendingFaction(faction)
    try {
      const result = await selectFaction(address, faction)
      if (result.success) {
        setActionSuccess(`Faction changed to ${getFactionName(faction)}!`)
        fetchAllPlayerData(address)
      } else {
        setActionError(result.error || 'Failed to select faction')
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to select faction')
    } finally {
      setIsSubmitting(false)
      setPendingFaction(null)
    }
  }

  const handleDeposit = async () => {
    if (!address || !depositAmount) return
    clearMessages()
    setIsSubmitting(true)
    try {
      const amount = parseUSDCInput(depositAmount)
      const result = await depositToVault(address, amount)
      if (result.success) {
        setActionSuccess(`Deposited ${depositAmount} USDC!`)
        setDepositAmount('')
        setShowDepositModal(false)
        fetchAllPlayerData(address)
      } else {
        setActionError(result.error || 'Failed to deposit')
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to deposit')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWithdraw = async () => {
    if (!address || !withdrawAmount) return
    clearMessages()
    setIsSubmitting(true)
    try {
      const amount = parseUSDCInput(withdrawAmount)
      const result = await withdrawFromVault(address, amount)
      if (result.success) {
        setActionSuccess(`Withdrew ${withdrawAmount} USDC!`)
        setWithdrawAmount('')
        setShowWithdrawModal(false)
        fetchAllPlayerData(address)
      } else {
        setActionError(result.error || 'Failed to withdraw')
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to withdraw')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClaimPlayerReward = async (epoch: number) => {
    if (!address) return
    clearMessages()
    setIsSubmitting(true)
    try {
      const result = await claimEpochReward(address, epoch)
      if (result.success) {
        setActionSuccess(`Claimed reward for epoch ${epoch}!`)
        fetchAllRewards(address, true, false)
        fetchAllPlayerData(address)
      } else {
        setActionError(result.error || 'Failed to claim reward')
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to claim reward')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClaimDevReward = async (epoch: number) => {
    if (!address) return
    clearMessages()
    setIsSubmitting(true)
    try {
      const result = await claimDevReward(address, epoch)
      if (result.success) {
        setActionSuccess(`Claimed dev reward for epoch ${epoch}!`)
        fetchAllRewards(address, false, true)
        fetchAllPlayerData(address)
      } else {
        setActionError(result.error || 'Failed to claim dev reward')
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to claim dev reward')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Calculate withdrawal warning
  const withdrawalAmount = withdrawAmount ? parseUSDCInput(withdrawAmount) : 0n
  const withdrawalPercentage = vaultBalance > 0n ? Number((withdrawalAmount * 100n) / vaultBalance) : 0
  const showWithdrawWarning = withdrawalPercentage > 50

  // Check minimum deposit for claiming
  const minDepositToClaim = config?.minDepositToClaim || 10000000n // 1 USDC default
  const canClaimRewards = vaultBalance >= minDepositToClaim

  // Faction standings from current epoch
  const factionStandings = currentEpochInfo?.factionStandings || new Map()

  // Show loading while restoring session
  if (isRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-terminal-bg">
        <AsciiLoader text="RESTORING SESSION" />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative" style={{ zIndex: 1 }}>
      <AsciiBackground />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-terminal-dim bg-terminal-bg/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-mono text-sm tracking-wider">
            <span className="text-terminal-dim">[</span>
            <span className="text-terminal-fg">OHLOSS</span>
            <span className="text-terminal-dim">]</span>
          </div>
          <nav className="flex items-center gap-4">
            <button
              onClick={() => setShowGameLibrary(true)}
              className="text-terminal-dim hover:text-terminal-fg text-xs transition-colors"
            >
              GAMES
            </button>
            <div className="flex items-center gap-2">
              <span className="text-terminal-dim text-xs">
                {address && truncateAddress(address)}
              </span>
              {address && (
                <button
                  onClick={handleCopyAddress}
                  className="text-terminal-dim hover:text-terminal-fg transition-colors"
                  title="Copy address"
                >
                  {addressCopied ? (
                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              className="text-terminal-dim hover:text-terminal-fg text-xs border border-terminal-dim px-3 py-1 transition-colors"
            >
              DISCONNECT
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-screen px-4 pt-20 pb-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Action Messages */}
          {(actionError || actionSuccess) && (
            <div className={`ascii-box p-4 ${actionError ? 'border-red-500' : 'border-green-500'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${actionError ? 'text-red-400' : 'text-green-400'}`}>
                  {actionError || actionSuccess}
                </span>
                <button
                  onClick={clearMessages}
                  className="text-terminal-dim hover:text-terminal-fg text-xs"
                >
                  [X]
                </button>
              </div>
            </div>
          )}

          {/* Player/Developer Toggle */}
          <div className="ascii-box p-4 bg-terminal-bg/90">
            <div className="flex items-center justify-between">
              <span className="text-terminal-dim text-xs tracking-wider">ACCOUNT TYPE:</span>
              <div className="flex items-center gap-6">
                <Checkbox
                  checked={isPlayer}
                  onChange={setIsPlayer}
                  label="I AM A PLAYER"
                  labelClassName="text-terminal-fg text-xs"
                />
                <Checkbox
                  checked={isDeveloper}
                  onChange={setIsDeveloper}
                  label="I AM A DEVELOPER"
                  labelClassName="text-terminal-fg text-xs"
                />
              </div>
            </div>
          </div>

          {/* Epoch Section */}
          <div className="ascii-box p-6 bg-terminal-bg/90">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-terminal-dim text-xs tracking-[0.3em] mb-1">{'// EPOCH //'}</p>
                <h2 className="text-2xl font-bold text-terminal-fg">
                  EPOCH {currentEpoch ?? '---'}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-terminal-dim text-xs mb-1">TIME REMAINING</p>
                <p className="text-terminal-fg text-xl font-mono">
                  {timeRemaining > 0 ? formatTimeRemaining(timeRemaining) : 'ENDED'}
                </p>
              </div>
            </div>

            {/* Faction Standings */}
            <div className="border border-terminal-dim p-4 mb-4">
              <p className="text-terminal-dim text-xs mb-3 tracking-wider">FACTION STANDINGS</p>
              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map((factionId) => {
                  const fp = factionStandings.get(factionId) || 0n
                  return (
                    <div key={factionId} className="text-center">
                      <div className="text-3xl font-mono text-terminal-fg/60 mb-1">
                        {getFactionSymbol(factionId)}
                      </div>
                      <div className="text-terminal-fg text-sm font-bold">
                        {formatUSDC(fp, 0)} FP
                      </div>
                      <div className="text-terminal-dim text-[10px]">
                        {getFactionName(factionId)}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-terminal-dim text-[10px] text-center mt-3">
                AUTO-REFRESHES EVERY 30 SECONDS
              </p>
            </div>

            {/* Cycle Button */}
            {canCycleEpoch(currentEpochInfo) && (
              <button
                onClick={handleCycleEpoch}
                disabled={isSubmitting}
                className="btn-retro text-sm w-full"
              >
                {isSubmitting ? <AsciiLoader text="CYCLING" /> : 'CYCLE EPOCH'}
              </button>
            )}
          </div>

          {/* Wallet Holdings */}
          <div className="ascii-box p-6 bg-terminal-bg/90">
            <div className="flex items-center justify-between mb-4">
              <p className="text-terminal-dim text-xs tracking-[0.3em]">{'// WALLET HOLDINGS //'}</p>
              <button
                onClick={handleRefreshBalances}
                disabled={isRefreshingBalances}
                className="text-terminal-dim hover:text-terminal-fg transition-colors disabled:opacity-50"
                title="Refresh balances"
              >
                <RefreshIcon spinning={isRefreshingBalances} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="border border-terminal-dim p-4 text-center">
                <div className="text-terminal-fg text-2xl font-bold">
                  {formatXLM(xlmBalance)}
                </div>
                <div className="text-terminal-dim text-[10px] tracking-wider">XLM</div>
              </div>
              <div className="border border-terminal-dim p-4 text-center">
                <div className="text-terminal-fg text-2xl font-bold">
                  {formatUSDC(usdcBalance)}
                </div>
                <div className="text-terminal-dim text-[10px] tracking-wider">USDC</div>
              </div>
            </div>

            {/* XLM to USDC Swap */}
            {address && (
              <SwapPanel
                xlmBalance={xlmBalance}
                address={address}
                onSwapComplete={() => {
                  if (address) {
                    refreshBalances(address)
                  }
                }}
              />
            )}
          </div>

          {/* Vault Section */}
          <div className="ascii-box p-6 bg-terminal-bg/90">
            <div className="flex items-center justify-between mb-4">
              <p className="text-terminal-dim text-xs tracking-[0.3em]">{'// VAULT //'}</p>
              <button
                onClick={handleRefreshBalances}
                disabled={isRefreshingBalances}
                className="text-terminal-dim hover:text-terminal-fg transition-colors disabled:opacity-50"
                title="Refresh vault data"
              >
                <RefreshIcon spinning={isRefreshingBalances} />
              </button>
            </div>

            {/* Vault Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="border border-terminal-dim p-4 text-center">
                <div className="text-terminal-fg text-xl font-bold">
                  ${formatUSDC(vaultBalance)}
                </div>
                <div className="text-terminal-dim text-[10px] tracking-wider">DEPOSITED</div>
              </div>
              <div className="border border-terminal-dim p-4 text-center">
                <div className="text-terminal-fg text-xl font-bold">
                  {formatUSDC(
                    epochPlayer?.availableFp ||
                    calculatePotentialFp(
                      vaultBalance,
                      amountMultiplier,
                      timeMultiplier,
                      config?.freeFpPerEpoch || DEFAULT_FREE_FP
                    ),
                    0
                  )}
                </div>
                <div className="text-terminal-dim text-[10px] tracking-wider">AVAILABLE FP</div>
              </div>
              <div className="border border-terminal-dim p-4 text-center">
                <div className="text-terminal-fg text-xl font-bold">
                  {formatUSDC(epochPlayer?.totalFpContributed || 0n, 0)}
                </div>
                <div className="text-terminal-dim text-[10px] tracking-wider">CONTRIBUTED FP</div>
              </div>
              <div className="border border-terminal-dim p-4 text-center">
                <div className="text-terminal-fg text-xl font-bold">
                  {(amountMultiplier * timeMultiplier).toFixed(2)}x
                </div>
                <div className="text-terminal-dim text-[10px] tracking-wider">TOTAL MULT</div>
              </div>
            </div>

            {/* Multiplier Details */}
            <div className="border border-terminal-dim p-4 mb-6">
              <p className="text-terminal-dim text-xs mb-3 tracking-wider">MULTIPLIER BREAKDOWN</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-terminal-dim">AMOUNT MULT:</span>
                  <span className="text-terminal-fg">{amountMultiplier.toFixed(2)}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-dim">TIME MULT:</span>
                  <span className="text-terminal-fg">{timeMultiplier.toFixed(2)}x</span>
                </div>
              </div>
              <p className="text-terminal-dim text-[10px] mt-3">
                PEAK: 2.45x AT $1K (AMOUNT) + 35 DAYS (TIME) = 6x COMBINED
              </p>
            </div>

            {/* Minimum Deposit Warning */}
            {!canClaimRewards && vaultBalance > 0n && (
              <div className="border border-yellow-500 p-3 mb-4">
                <p className="text-yellow-400 text-xs">
                  WARNING: DEPOSIT ${formatUSDC(minDepositToClaim)} MINIMUM TO CLAIM REWARDS
                </p>
              </div>
            )}

            {/* Deposit/Withdraw Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowDepositModal(true)}
                className="btn-retro text-sm"
              >
                DEPOSIT
              </button>
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={vaultBalance <= 0n}
                className="btn-retro text-sm disabled:opacity-50"
              >
                WITHDRAW
              </button>
            </div>
          </div>

          {/* Faction Selection */}
          <div className="ascii-box p-6 bg-terminal-bg/90">
            <p className="text-terminal-dim text-xs tracking-[0.3em] mb-4">{'// FACTION //'}</p>

            {/* Current Epoch Faction */}
            {epochPlayer?.epochFaction !== null && epochPlayer?.epochFaction !== undefined && (
              <div className="border border-terminal-dim p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-terminal-dim text-xs">THIS EPOCH:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-mono text-terminal-fg">
                      {getFactionSymbol(epochPlayer.epochFaction)}
                    </span>
                    <span className="text-terminal-fg text-sm">
                      {getFactionName(epochPlayer.epochFaction)}
                    </span>
                  </div>
                </div>
                <p className="text-terminal-dim text-[10px] mt-2">
                  LOCKED FOR THIS EPOCH - CHANGES APPLY NEXT EPOCH
                </p>
              </div>
            )}

            {/* Select Faction for Next Epoch */}
            <div>
              <p className="text-terminal-dim text-xs mb-3 tracking-wider">
                {epochPlayer?.epochFaction !== null ? 'SELECT FOR NEXT EPOCH:' : 'SELECT YOUR FACTION:'}
              </p>
              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map((factionId) => {
                  const isSelected = player?.selectedFaction === factionId
                  return (
                    <button
                      key={factionId}
                      onClick={() => handleSelectFaction(factionId)}
                      disabled={isSubmitting || isSelected}
                      className={`border p-4 text-center transition-colors ${
                        isSelected
                          ? 'border-terminal-fg bg-terminal-fg/10'
                          : 'border-terminal-dim hover:bg-terminal-fg/5'
                      } ${isSubmitting && pendingFaction === factionId ? 'animate-pulse' : ''}`}
                    >
                      <div className="text-4xl font-mono text-terminal-fg/60 mb-2">
                        {getFactionSymbol(factionId)}
                      </div>
                      <div className="text-terminal-dim text-[10px]">
                        {getFactionName(factionId)}
                      </div>
                      {isSelected && (
                        <div className="text-terminal-fg text-[10px] mt-1">SELECTED</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Player Rewards Section */}
          {isPlayer && (
            <div className="ascii-box p-6 bg-terminal-bg/90">
              <div className="flex items-center justify-between mb-4">
                <p className="text-terminal-dim text-xs tracking-[0.3em]">{'// PLAYER REWARDS //'}</p>
                <span className="text-terminal-fg text-sm font-bold">
                  TOTAL: ${formatUSDC(getTotalPlayerRewards(playerRewards))}
                </span>
              </div>

              {isLoadingRewards ? (
                <div className="text-center py-8">
                  <AsciiLoader text="LOADING REWARDS" />
                </div>
              ) : playerRewards.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-terminal-dim text-xs">NO CLAIMABLE REWARDS</p>
                  <p className="text-terminal-dim text-[10px] mt-2">
                    WIN EPOCHS TO EARN REWARDS
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {playerRewards.map((reward) => (
                    <div
                      key={reward.epoch}
                      className="border border-terminal-dim p-3 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-terminal-fg text-sm">EPOCH {reward.epoch}</span>
                        <span className="text-terminal-dim text-xs ml-2">
                          {getFactionSymbol(reward.faction)} {getFactionName(reward.faction)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-terminal-fg text-sm font-bold">
                          ${formatUSDC(reward.amount)}
                        </span>
                        <button
                          onClick={() => handleClaimPlayerReward(reward.epoch)}
                          disabled={isSubmitting || !canClaimRewards}
                          className="text-xs border border-terminal-dim px-3 py-1 hover:bg-terminal-fg/10 disabled:opacity-50"
                        >
                          CLAIM
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!canClaimRewards && playerRewards.length > 0 && (
                <p className="text-yellow-400 text-[10px] mt-4 text-center">
                  DEPOSIT ${formatUSDC(minDepositToClaim)} TO UNLOCK CLAIMING
                </p>
              )}
            </div>
          )}

          {/* Developer Rewards Section */}
          {isDeveloper && (
            <div className="ascii-box p-6 bg-terminal-bg/90">
              <div className="flex items-center justify-between mb-4">
                <p className="text-terminal-dim text-xs tracking-[0.3em]">{'// DEVELOPER REWARDS //'}</p>
                <span className="text-terminal-fg text-sm font-bold">
                  TOTAL: ${formatUSDC(getTotalDevRewards(devRewards))}
                </span>
              </div>

              {isLoadingRewards ? (
                <div className="text-center py-8">
                  <AsciiLoader text="LOADING DEV REWARDS" />
                </div>
              ) : devRewards.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-terminal-dim text-xs">NO CLAIMABLE DEV REWARDS</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {devRewards.map((reward) => (
                    <div
                      key={reward.epoch}
                      className="border border-terminal-dim p-3 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-terminal-fg text-sm">EPOCH {reward.epoch}</span>
                        <span className="text-terminal-dim text-xs ml-2">
                          {formatUSDC(reward.fpContributed, 0)} FP
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-terminal-fg text-sm font-bold">
                          ${formatUSDC(reward.amount)}
                        </span>
                        <button
                          onClick={() => handleClaimDevReward(reward.epoch)}
                          disabled={isSubmitting}
                          className="text-xs border border-terminal-dim px-3 py-1 hover:bg-terminal-fg/10 disabled:opacity-50"
                        >
                          CLAIM
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="text-center py-4">
            <p className="text-terminal-dim text-xs">
              {'// '} OHLOSS v0.0.1 {' //'}
            </p>
          </div>
        </div>
      </main>

      {/* Deposit Modal */}
      {showDepositModal && (
        <Modal onClose={() => setShowDepositModal(false)}>
          <div className="p-6">
            <h3 className="text-terminal-fg text-lg mb-4 tracking-wider">DEPOSIT USDC</h3>
            <div className="mb-4">
              <label className="text-terminal-dim text-xs block mb-2">AMOUNT (USDC)</label>
              <input
                type="text"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-terminal-bg border border-terminal-dim px-3 py-2 text-terminal-fg font-mono focus:border-terminal-fg outline-none"
              />
            </div>
            <div className="text-terminal-dim text-xs mb-4">
              AVAILABLE: {formatUSDC(usdcBalance)} USDC
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowDepositModal(false)}
                className="btn-retro text-sm"
              >
                CANCEL
              </button>
              <button
                onClick={handleDeposit}
                disabled={isSubmitting || !depositAmount}
                className="btn-retro text-sm disabled:opacity-50"
              >
                {isSubmitting ? <AsciiLoader text="DEPOSITING" /> : 'CONFIRM'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <Modal onClose={() => setShowWithdrawModal(false)}>
          <div className="p-6">
            <h3 className="text-terminal-fg text-lg mb-4 tracking-wider">WITHDRAW USDC</h3>
            <div className="mb-4">
              <label className="text-terminal-dim text-xs block mb-2">AMOUNT (USDC)</label>
              <input
                type="text"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-terminal-bg border border-terminal-dim px-3 py-2 text-terminal-fg font-mono focus:border-terminal-fg outline-none"
              />
            </div>
            <div className="text-terminal-dim text-xs mb-4">
              DEPOSITED: {formatUSDC(vaultBalance)} USDC
            </div>

            {/* 50% Withdrawal Warning */}
            {showWithdrawWarning && (
              <div className="border border-red-500 p-3 mb-4">
                <p className="text-red-400 text-xs font-bold mb-1">WARNING: {withdrawalPercentage}% WITHDRAWAL</p>
                <p className="text-red-400 text-[10px]">
                  WITHDRAWING MORE THAN 50% WILL RESET YOUR TIME MULTIPLIER TO 1x!
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="btn-retro text-sm"
              >
                CANCEL
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isSubmitting || !withdrawAmount}
                className="btn-retro text-sm disabled:opacity-50"
              >
                {isSubmitting ? <AsciiLoader text="WITHDRAWING" /> : 'CONFIRM'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Game Library Modal */}
      {showGameLibrary && (
        <Modal onClose={() => setShowGameLibrary(false)}>
          <div className="p-6">
            <h3 className="text-terminal-fg text-lg mb-4 tracking-wider">GAME LIBRARY</h3>
            <div className="space-y-3">
              {MOCK_GAMES.map((game) => (
                <div
                  key={game.id}
                  className="border border-terminal-dim p-4 flex items-center justify-between"
                >
                  <div>
                    <span className="text-terminal-fg text-sm">{game.name}</span>
                    {game.players > 0 && (
                      <span className="text-terminal-dim text-xs ml-2">
                        {game.players} PLAYERS
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs ${
                      game.status === 'LIVE' ? 'text-green-400' : 'text-terminal-dim'
                    }`}
                  >
                    {game.status}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowGameLibrary(false)}
              className="btn-retro text-sm w-full mt-4"
            >
              CLOSE
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// Simple Modal Component
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-terminal-bg/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative ascii-box bg-terminal-bg max-w-md w-full mx-4">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-terminal-dim hover:text-terminal-fg text-xs"
        >
          [X]
        </button>
        {children}
      </div>
    </div>
  )
}
