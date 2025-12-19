import { useState, useEffect } from 'react';
import { ohlossService } from '@/services/ohlossService';
import { feeVaultService } from '@/services/feeVaultService';
import { balanceService } from '@/services/balanceService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { USDC_DECIMALS } from '@/utils/constants';
import { FactionSelection } from './FactionSelection';
import { EpochTimer } from './EpochTimer';
import { FactionStandings } from './FactionStandings';
import { GamesCatalog } from './GamesCatalog';
import { VaultQuickActions } from './VaultQuickActions';
import { RewardsClaim } from './RewardsClaim';
import { useWallet } from '@/hooks/useWallet';

interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const { walletType, walletId, publicKey, getContractSigner } = useWallet();
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [faction, setFaction] = useState<number | null>(null); // Selected faction (for next epoch)
  const [currentEpochFaction, setCurrentEpochFaction] = useState<number | null>(null); // Locked faction for current epoch
  const [availableFP, setAvailableFP] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [isGameActive, setIsGameActive] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [standingsRefresh, setStandingsRefresh] = useState(0);
  const [usdcRefreshTrigger, setUsdcRefreshTrigger] = useState(0);
  const [showFactionSwitcher, setShowFactionSwitcher] = useState(false);
  const [switchingFaction, setSwitchingFaction] = useState(false);
  const [xlmBalance, setXlmBalance] = useState<bigint>(0n);

  const userAddress = publicKey!;

  const copyAddressToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(userAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleSwitchFaction = async (newFactionId: number) => {
    try {
      setSwitchingFaction(true);
      const signer = getContractSigner();

      await ohlossService.selectFaction(userAddress, newFactionId, signer);

      // Refresh dashboard data to update faction display
      await loadDashboardData();

      // Close the faction switcher
      setShowFactionSwitcher(false);
    } catch (error) {
      console.error('Failed to switch faction:', error);
      alert(`Failed to switch faction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSwitchingFaction(false);
    }
  };

  useEffect(() => {
    const abortController = new AbortController();

    const loadData = async () => {
      try {
        setLoading(true);

        // Use requestCache to prevent duplicate calls in React Strict Mode
        const [epoch, balance, xlm] = await Promise.all([
          requestCache.dedupe(
            'current-epoch',
            () => ohlossService.getCurrentEpoch(),
            30000,
            abortController.signal
          ),
          requestCache.dedupe(
            createCacheKey('vault-balance', userAddress),
            () => feeVaultService.getUserBalance(userAddress),
            30000,
            abortController.signal
          ),
          requestCache.dedupe(
            createCacheKey('xlm-balance', userAddress),
            () => balanceService.getXLMBalance(userAddress),
            30000,
            abortController.signal
          ),
        ]);

        setCurrentEpoch(epoch);
        setVaultBalance(balance);
        setXlmBalance(xlm);

        // Try to get player data
        try {
          const [playerData, epochPlayerData] = await Promise.all([
            requestCache.dedupe(
              createCacheKey('player', userAddress),
              () => ohlossService.getPlayer(userAddress),
              30000,
              abortController.signal
            ),
            requestCache.dedupe(
              createCacheKey('epoch-player', epoch, userAddress),
              () => ohlossService.getEpochPlayer(epoch, userAddress),
              30000,
              abortController.signal
            ),
          ]);

          setFaction(playerData.selected_faction); // Next epoch faction
          setAvailableFP(BigInt(epochPlayerData.available_fp));
          setCurrentEpochFaction(epochPlayerData.epoch_faction !== null && epochPlayerData.epoch_faction !== undefined
            ? epochPlayerData.epoch_faction
            : null); // Current epoch locked faction
        } catch {
          // Player might not exist yet
          setFaction(null);
          setCurrentEpochFaction(null);
          setAvailableFP(0n);
        }

        // Trigger faction standings refresh
        setStandingsRefresh(prev => prev + 1);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Failed to load dashboard data:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      abortController.abort();
    };
  }, [userAddress]);

  // Poll for epoch changes periodically (other players might cycle the epoch)
  useEffect(() => {
    const pollEpoch = async () => {
      try {
        // Invalidate epoch cache and fetch fresh data
        requestCache.invalidate('current-epoch');
        const newEpoch = await ohlossService.getCurrentEpoch();

        // If epoch changed, update everything
        if (newEpoch !== currentEpoch) {
          console.log(`Epoch changed from ${currentEpoch} to ${newEpoch} - refreshing all data`);
          setCurrentEpoch(newEpoch);

          // Invalidate all caches and reload dashboard
          await loadDashboardData();
        }
      } catch (err) {
        console.error('Failed to poll epoch:', err);
      }
    };

    // Poll every 15 seconds to catch epoch cycles by other players
    const interval = setInterval(pollEpoch, 15000);

    return () => clearInterval(interval);
  }, [currentEpoch, userAddress]);

  useEffect(() => {
    // Only set up auto-refresh if no game is active
    if (!isGameActive) {
      const interval = setInterval(() => {
        // Invalidate cache before refresh to get fresh data
        requestCache.invalidatePrefix('current-epoch');
        requestCache.invalidatePrefix(createCacheKey('vault-balance', userAddress));
        requestCache.invalidatePrefix(createCacheKey('xlm-balance', userAddress));
        requestCache.invalidatePrefix(createCacheKey('player', userAddress));
        requestCache.invalidatePrefix(createCacheKey('epoch-player'));
      }, 30000); // Invalidate cache every 30s to trigger fresh fetches
      return () => clearInterval(interval);
    }
  }, [isGameActive, userAddress]);

  const loadDashboardData = async () => {
    try {
      // Invalidate relevant cache entries to force fresh data
      requestCache.invalidatePrefix('current-epoch');
      requestCache.invalidatePrefix(createCacheKey('vault-balance', userAddress));
      requestCache.invalidatePrefix(createCacheKey('usdc-balance', userAddress)); // Also refresh USDC balance (used by VaultQuickActions)
      requestCache.invalidatePrefix(createCacheKey('xlm-balance', userAddress));
      requestCache.invalidatePrefix(createCacheKey('player', userAddress));
      requestCache.invalidatePrefix(createCacheKey('epoch-player'));

      // Re-trigger the main useEffect by updating a dependency if needed
      // For now, we'll manually fetch without loading state for refreshes
      const [epoch, balance, xlm] = await Promise.all([
        ohlossService.getCurrentEpoch(),
        feeVaultService.getUserBalance(userAddress),
        balanceService.getXLMBalance(userAddress),
      ]);

      setCurrentEpoch(epoch);
      setVaultBalance(balance);
      setXlmBalance(xlm);

      // Try to get player data
      try {
        const playerData = await ohlossService.getPlayer(userAddress);
        setFaction(playerData.selected_faction); // Next epoch faction

        // Get epoch player data for FP and current epoch faction
        const epochPlayerData = await ohlossService.getEpochPlayer(epoch, userAddress);
        setAvailableFP(BigInt(epochPlayerData.available_fp));
        setCurrentEpochFaction(epochPlayerData.epoch_faction !== null && epochPlayerData.epoch_faction !== undefined
          ? epochPlayerData.epoch_faction
          : null); // Current epoch locked faction
      } catch {
        // Player might not exist yet
        setFaction(null);
        setCurrentEpochFaction(null);
        setAvailableFP(0n);
      }

      // Trigger faction standings refresh
      setStandingsRefresh(prev => prev + 1);

      // Trigger USDC balance refresh in VaultQuickActions
      setUsdcRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const formatAmount = (amount: bigint): string => {
    const divisor = BigInt(10 ** USDC_DECIMALS);
    const whole = amount / divisor;
    const fraction = amount % divisor;

    if (fraction === 0n) {
      return whole.toString();
    }

    const fractionStr = fraction.toString().padStart(USDC_DECIMALS, '0');
    // Remove trailing zeros but keep significant decimals
    const trimmed = fractionStr.replace(/0+$/, '');
    return `${whole}.${trimmed}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-6">
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-12 border border-white/40">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-gradient-to-r from-blue-200 to-purple-200 rounded-2xl w-64"></div>
            <div className="h-6 bg-gradient-to-r from-purple-200 to-pink-200 rounded-xl w-40"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>

      <div className="relative z-10">
      {/* Header */}
      <header className="mx-3 sm:mx-6 mt-3 sm:mt-6 mb-4 bg-white/60 backdrop-blur-2xl rounded-3xl shadow-lg border border-white/60">
        <div className="px-4 sm:px-8 py-4 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-shrink-0">
            <h1 className="text-2xl sm:text-4xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-1">
              Ohloss
            </h1>
            <p className="text-xs sm:text-sm font-medium text-gray-500">
              Faction Gaming Protocol
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
            <div
              onClick={copyAddressToClipboard}
              className="text-right bg-gradient-to-br from-blue-50 to-purple-50 px-3 sm:px-4 py-2 sm:py-3 rounded-2xl border border-blue-100 cursor-pointer hover:border-blue-300 hover:shadow-lg transition-all transform hover:scale-105 group relative flex-1 sm:flex-initial"
              title="Click to copy address"
            >
              <div className="text-xs font-semibold text-blue-600 mb-1 flex items-center gap-1.5">
                <span>{walletType === 'dev' ? walletId : 'Wallet'}</span>
                <svg className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-xs font-mono font-bold text-gray-700 mb-1">
                {userAddress.slice(0, 8)}...{userAddress.slice(-4)}
              </div>
              <div className="text-xs font-bold text-purple-600">
                {formatAmount(xlmBalance)} XLM
              </div>
              {addressCopied && (
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-50">
                  Copied!
                </div>
              )}
            </div>
            <button
              onClick={onLogout}
              className="px-4 sm:px-5 py-2 sm:py-3 rounded-2xl bg-gradient-to-br from-red-500 to-pink-500 text-white text-sm font-semibold hover:from-red-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Left Sidebar - Epoch & Stats */}
        <div className="lg:col-span-3 space-y-3 sm:space-y-4">
          <EpochTimer currentEpoch={currentEpoch} onEpochCycled={() => loadDashboardData()} />
          <FactionStandings currentEpoch={currentEpoch} refreshTrigger={standingsRefresh} />

          {/* Player Stats Card */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-pink-100 hover:shadow-xl transition-shadow">
            <h3 className="text-lg font-bold mb-4 text-gray-900">
              Your Stats
            </h3>
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-xl border border-blue-100">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-1">Vault Balance</div>
                <div className="text-2xl font-black text-blue-700">
                  {formatAmount(vaultBalance)} USDC
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-100">
                <div className="text-xs font-bold uppercase tracking-wide text-purple-600 mb-1">Available FP</div>
                <div className="text-2xl font-black text-purple-700">
                  {formatAmount(availableFP)}
                </div>
              </div>
              {faction !== null && (
                <div className="bg-gradient-to-br from-gray-50 to-slate-50 p-4 rounded-xl border border-gray-200">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-2">
                    {currentEpochFaction !== null ? 'Faction Status' : 'Your Faction'}
                  </div>

                  {/* Current Epoch Faction (if player has played a game this epoch) */}
                  {currentEpochFaction !== null ? (
                    <>
                      <div className="mb-2">
                        <div className="text-xs text-gray-500 mb-0.5">Current Epoch:</div>
                        <div className="text-lg font-bold text-gray-800">
                          {currentEpochFaction === 0 ? '🍜 WholeNoodle' : currentEpochFaction === 1 ? '🗡️ PointyStick' : '🪨 SpecialRock'}
                        </div>
                      </div>

                      {/* Only show Next Epoch if different from current */}
                      {faction !== currentEpochFaction && (
                        <div className="mb-2 pb-2 border-b border-gray-200">
                          <div className="text-xs text-gray-500 mb-0.5">Next Epoch:</div>
                          <div className="text-sm font-bold text-orange-600">
                            {faction === 0 ? '🍜 WholeNoodle' : faction === 1 ? '🗡️ PointyStick' : '🪨 SpecialRock'}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* No current epoch faction yet - show selected faction */
                    <div className="mb-2">
                      <div className="text-xs text-gray-500 mb-0.5">Selected:</div>
                      <div className="text-lg font-bold text-gray-800">
                        {faction === 0 ? '🍜 WholeNoodle' : faction === 1 ? '🗡️ PointyStick' : '🪨 SpecialRock'}
                      </div>
                    </div>
                  )}

                  {/* Change Faction Button */}
                  <button
                    onClick={() => setShowFactionSwitcher(!showFactionSwitcher)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold transition-colors"
                  >
                    {showFactionSwitcher ? 'Cancel' : 'Change Faction'}
                  </button>

                  {/* Faction Switcher Dropdown */}
                  {showFactionSwitcher && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      {[
                        { id: 0, name: 'WholeNoodle', emoji: '🍜' },
                        { id: 1, name: 'PointyStick', emoji: '🗡️' },
                        { id: 2, name: 'SpecialRock', emoji: '🪨' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => handleSwitchFaction(f.id)}
                          disabled={f.id === faction || switchingFaction}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                            f.id === faction
                              ? 'bg-green-100 text-green-700 cursor-default'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer'
                          } ${switchingFaction ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {f.emoji} {f.name} {f.id === faction && '✓'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <VaultQuickActions userAddress={userAddress} onSuccess={loadDashboardData} refreshTrigger={usdcRefreshTrigger} />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-9 space-y-3 sm:space-y-4">
          {faction === null ? (
            <FactionSelection userAddress={userAddress} onSuccess={loadDashboardData} />
          ) : (
            <>
              <RewardsClaim
                userAddress={userAddress}
                currentEpoch={currentEpoch}
                onSuccess={loadDashboardData}
              />
              <GamesCatalog
                userAddress={userAddress}
                currentEpoch={currentEpoch}
                availableFP={availableFP}
                onGameComplete={loadDashboardData}
                onGameActiveChange={setIsGameActive}
              />
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
