import { useState, useEffect, useRef } from 'react';
import { blendizzardService } from '@/services/blendizzardService';
import { devWalletService } from '@/services/devWalletService';
import { USDC_DECIMALS } from '@/utils/constants';

interface RewardsClaimProps {
  userAddress: string;
  currentEpoch: number;
  onSuccess: () => void;
}

export function RewardsClaim({ userAddress, currentEpoch, onSuccess }: RewardsClaimProps) {
  const [claimableEpochs, setClaimableEpochs] = useState<number[]>([]);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lastCheckedEpoch = useRef<number | null>(null);

  useEffect(() => {
    // Prevent duplicate checks from React Strict Mode to avoid wasting RPC rate limits
    if (lastCheckedEpoch.current === currentEpoch) {
      return;
    }
    lastCheckedEpoch.current = currentEpoch;
    findClaimableEpochs();
  }, [currentEpoch]);

  const findClaimableEpochs = async () => {
    const claimable: number[] = [];

    // Check previous 3 epochs for claimable rewards
    for (let i = 1; i <= 3 && currentEpoch - i >= 0; i++) {
      const epoch = currentEpoch - i;

      // Simulate claim to verify rewards are actually claimable
      // This checks: epoch finalized, faction won, not already claimed, rewards available
      const canClaim = await blendizzardService.canClaimEpochReward(userAddress, epoch);

      if (canClaim) {
        claimable.push(epoch);
      }
    }

    setClaimableEpochs(claimable);
  };

  const handleClaim = async (epoch: number) => {
    try {
      setClaiming(epoch);
      setError(null);
      setSuccess(null);

      const signer = devWalletService.getSigner();
      const amount = await blendizzardService.claimEpochReward(userAddress, epoch, signer);

      const divisor = BigInt(10 ** USDC_DECIMALS);
      const formatted = (Number(amount) / Number(divisor)).toFixed(2);

      setSuccess(`Claimed ${formatted} USDC from Epoch #${epoch}!`);

      // Remove claimed epoch from list
      setClaimableEpochs(prev => prev.filter(e => e !== epoch));

      onSuccess();
    } catch (err) {
      console.error('Claim error:', err);
      setError(err instanceof Error ? err.message : 'Failed to claim rewards');
    } finally {
      setClaiming(null);
    }
  };

  if (claimableEpochs.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 backdrop-blur-xl rounded-2xl p-6 shadow-lg border-2 border-green-200 hover:shadow-xl transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-black text-gray-900">
            Unclaimed Rewards
          </h3>
          <p className="text-sm font-semibold text-green-700">
            You have rewards from {claimableEpochs.length} past epoch{claimableEpochs.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-300 rounded-xl">
          <p className="text-sm font-semibold text-green-800">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {claimableEpochs.map((epoch) => (
          <button
            key={epoch}
            onClick={() => handleClaim(epoch)}
            disabled={claiming !== null}
            className="p-5 rounded-xl bg-white border-2 border-green-300 hover:bg-gradient-to-br hover:from-green-100 hover:to-emerald-100 hover:border-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none"
          >
            <div className="text-xs font-bold uppercase tracking-wide text-green-600 mb-1">Epoch</div>
            <div className="text-3xl font-black text-green-700">#{epoch}</div>
            {claiming === epoch ? (
              <div className="text-xs font-semibold text-gray-600 mt-2">Claiming...</div>
            ) : (
              <div className="text-xs font-bold text-green-600 mt-2">Click to Claim</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
