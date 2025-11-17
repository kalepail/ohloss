import { useState, useEffect } from 'react';
import { blendizzardService } from '@/services/blendizzardService';
import { feeVaultService } from '@/services/feeVaultService';
import { devWalletService } from '@/services/devWalletService';
import { USDC_DECIMALS } from '@/utils/constants';
import { FactionSelection } from './FactionSelection';
import { EpochTimer } from './EpochTimer';
import { FactionStandings } from './FactionStandings';
import { GamesCatalog } from './GamesCatalog';
import { VaultQuickActions } from './VaultQuickActions';
import { RewardsClaim } from './RewardsClaim';

interface DashboardProps {
  playerNumber: 1 | 2;
  onLogout: () => void;
}

export function Dashboard({ playerNumber, onLogout }: DashboardProps) {
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [faction, setFaction] = useState<number | null>(null);
  const [availableFP, setAvailableFP] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [isGameActive, setIsGameActive] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const userAddress = devWalletService.getPublicKey();

  const copyAddressToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(userAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  useEffect(() => {
    // Initial load on mount only
    loadDashboardData(true);
  }, []);

  useEffect(() => {
    // Only set up auto-refresh if no game is active
    if (!isGameActive) {
      const interval = setInterval(() => loadDashboardData(false), 30000); // Refresh every 30s without loading screen
      return () => clearInterval(interval);
    }
  }, [isGameActive]);

  const loadDashboardData = async (isInitialLoad = false) => {
    try {
      // Only show loading screen on initial load, not on refresh
      if (isInitialLoad) {
        setLoading(true);
      }

      const [epoch, balance] = await Promise.all([
        blendizzardService.getCurrentEpoch(),
        feeVaultService.getUserBalance(userAddress),
      ]);

      setCurrentEpoch(epoch);
      setVaultBalance(balance);

      // Try to get player data
      try {
        const playerData = await blendizzardService.getPlayer(userAddress);
        setFaction(playerData.selected_faction);

        // Get epoch player data for FP
        const epochPlayerData = await blendizzardService.getEpochPlayer(epoch, userAddress);
        setAvailableFP(BigInt(epochPlayerData.available_fp));
      } catch {
        // Player might not exist yet
        setFaction(null);
        setAvailableFP(0n);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  };

  const formatAmount = (amount: bigint): string => {
    const divisor = BigInt(10 ** USDC_DECIMALS);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    return `${whole}.${fraction.toString().padStart(USDC_DECIMALS, '0')}`;
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
      <header className="mx-6 mt-6 mb-4 bg-white/60 backdrop-blur-2xl rounded-3xl shadow-lg border border-white/60">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-1">
              Blendizzard
            </h1>
            <p className="text-sm font-medium text-gray-500">
              Faction Gaming Protocol
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div
              onClick={copyAddressToClipboard}
              className="text-right bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-3 rounded-2xl border border-blue-100 cursor-pointer hover:border-blue-300 hover:shadow-lg transition-all transform hover:scale-105 group relative"
              title="Click to copy address"
            >
              <div className="text-xs font-semibold text-blue-600 mb-1 flex items-center gap-1.5">
                <span>Player {playerNumber}</span>
                <svg className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-xs font-mono font-bold text-gray-700">
                {userAddress.slice(0, 8)}...{userAddress.slice(-4)}
              </div>
              {addressCopied && (
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                  Copied!
                </div>
              )}
            </div>
            <button
              onClick={onLogout}
              className="px-5 py-3 rounded-2xl bg-gradient-to-br from-red-500 to-pink-500 text-white font-semibold hover:from-red-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="p-4 grid grid-cols-12 gap-4">
        {/* Left Sidebar - Epoch & Stats */}
        <div className="col-span-3 space-y-4">
          <EpochTimer currentEpoch={currentEpoch} onEpochCycled={() => loadDashboardData(false)} />
          <FactionStandings currentEpoch={currentEpoch} />

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
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Faction</div>
                  <div className="text-lg font-bold text-gray-800">
                    {faction === 0 ? '🍜 WholeNoodle' : faction === 1 ? '🗡️ PointyStick' : '🪨 SpecialRock'}
                  </div>
                </div>
              )}
            </div>
          </div>

          <VaultQuickActions userAddress={userAddress} onSuccess={loadDashboardData} />
        </div>

        {/* Main Content */}
        <div className="col-span-9 space-y-4">
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
