import { useState, useEffect } from 'react';
import { blendizzardService } from '@/services/blendizzardService';
import { feeVaultService } from '@/services/feeVaultService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { USDC_DECIMALS } from '@/utils/constants';
import { useWallet } from '@/hooks/useWallet';

interface RewardsClaimProps {
  userAddress: string;
  currentEpoch: number;
  onSuccess: () => void;
}

interface ClaimableEpoch {
  epoch: number;
  isLocked: boolean; // true if user doesn't meet deposit threshold
}

export function RewardsClaim({ userAddress, currentEpoch, onSuccess }: RewardsClaimProps) {
  const { getContractSigner } = useWallet();
  const [claimableEpochs, setClaimableEpochs] = useState<ClaimableEpoch[]>([]);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [minDepositRequired, setMinDepositRequired] = useState<bigint>(BigInt(0));
  const [userVaultBalance, setUserVaultBalance] = useState<bigint>(BigInt(0));
  const [meetsDepositThreshold, setMeetsDepositThreshold] = useState<boolean>(true);

  useEffect(() => {
    const abortController = new AbortController();

    const findClaimableEpochs = async () => {
      try {
        // Fetch config and vault balance in parallel with epoch checks
        const [config, vaultBalance] = await Promise.all([
          requestCache.dedupe(
            createCacheKey('blendizzard-config'),
            () => blendizzardService.getConfig(),
            60000, // Cache for 1 minute
            abortController.signal
          ),
          requestCache.dedupe(
            createCacheKey('vault-balance', userAddress),
            () => feeVaultService.getUserBalance(userAddress),
            30000,
            abortController.signal
          ),
        ]);

        // Default to 1 USDC (7 decimals) if config field not present (backwards compatibility)
        const minDeposit = BigInt(config.min_deposit_to_claim ?? 1_0000000n);
        setMinDepositRequired(minDeposit);
        setUserVaultBalance(vaultBalance);
        const meetsThreshold = vaultBalance >= minDeposit;
        setMeetsDepositThreshold(meetsThreshold);

        // Check previous 3 epochs for claimable rewards IN PARALLEL
        const epochsToCheck = [];
        for (let i = 1; i <= 3 && currentEpoch - i >= 0; i++) {
          epochsToCheck.push(currentEpoch - i);
        }

        // Run all checks in parallel using requestCache
        const claimabilityResults = await Promise.all(
          epochsToCheck.map((epoch) =>
            requestCache.dedupe(
              createCacheKey('can-claim-epoch', userAddress, epoch),
              () => blendizzardService.canClaimEpochReward(userAddress, epoch),
              30000,
              abortController.signal
            ).then((canClaim) => ({ epoch, canClaim }))
          )
        );

        // Filter to only claimable epochs and mark locked status
        const claimable: ClaimableEpoch[] = claimabilityResults
          .filter((result) => result.canClaim)
          .map((result) => ({
            epoch: result.epoch,
            isLocked: !meetsThreshold,
          }));

        setClaimableEpochs(claimable);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Failed to check claimable epochs:', error);
        }
      }
    };

    findClaimableEpochs();

    return () => {
      abortController.abort();
    };
  }, [currentEpoch, userAddress]);

  const handleClaim = async (epoch: number) => {
    // Check deposit threshold before attempting to claim
    if (!meetsDepositThreshold) {
      setError(`You need to deposit at least ${formatUsdc(minDepositRequired)} USDC to unlock rewards.`);
      return;
    }

    try {
      setClaiming(epoch);
      setError(null);
      setSuccess(null);

      const signer = getContractSigner();
      const amount = await blendizzardService.claimEpochReward(userAddress, epoch, signer);

      const formatted = formatUsdc(amount);

      setSuccess(`Claimed ${formatted} USDC from Epoch #${epoch}!`);

      // Invalidate cache for this epoch since it's now claimed
      requestCache.invalidate(createCacheKey('can-claim-epoch', userAddress, epoch));
      requestCache.invalidate(createCacheKey('vault-balance', userAddress));

      // Remove claimed epoch from list
      setClaimableEpochs(prev => prev.filter(e => e.epoch !== epoch));

      onSuccess();
    } catch (err) {
      console.error('Claim error:', err);

      // Check for specific DepositRequiredToClaim error
      const errorMessage = err instanceof Error ? err.message : 'Failed to claim rewards';
      if (errorMessage.includes('#43') || errorMessage.includes('DepositRequiredToClaim')) {
        setError(`Deposit required: You need at least ${formatUsdc(minDepositRequired)} USDC deposited to claim rewards.`);
      } else {
        setError(errorMessage);
      }
    } finally {
      setClaiming(null);
    }
  };

  const formatUsdc = (amount: bigint): string => {
    const divisor = BigInt(10 ** USDC_DECIMALS);
    return (Number(amount) / Number(divisor)).toFixed(2);
  };

  if (claimableEpochs.length === 0) {
    return null;
  }

  const hasLockedRewards = claimableEpochs.some(e => e.isLocked);

  return (
    <div className={`bg-gradient-to-br ${hasLockedRewards ? 'from-amber-50 via-yellow-50 to-orange-50' : 'from-green-50 via-emerald-50 to-teal-50'} backdrop-blur-xl rounded-2xl p-6 shadow-lg border-2 ${hasLockedRewards ? 'border-amber-200' : 'border-green-200'} hover:shadow-xl transition-shadow`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${hasLockedRewards ? 'from-amber-400 to-orange-500' : 'from-green-400 to-emerald-500'} flex items-center justify-center shadow-lg`}>
          {hasLockedRewards ? (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div>
          <h3 className="text-xl font-black text-gray-900">
            {hasLockedRewards ? 'Locked Rewards' : 'Unclaimed Rewards'}
          </h3>
          <p className={`text-sm font-semibold ${hasLockedRewards ? 'text-amber-700' : 'text-green-700'}`}>
            You have rewards from {claimableEpochs.length} past epoch{claimableEpochs.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Deposit gate warning */}
      {hasLockedRewards && (
        <div className="mb-4 p-4 bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-300 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-bold text-amber-800">Deposit Required to Unlock</p>
              <p className="text-sm text-amber-700 mt-1">
                Deposit at least <span className="font-bold">{formatUsdc(minDepositRequired)} USDC</span> to the vault to claim your rewards.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                Current vault balance: <span className="font-semibold">{formatUsdc(userVaultBalance)} USDC</span>
              </p>
            </div>
          </div>
        </div>
      )}

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
        {claimableEpochs.map(({ epoch, isLocked }) => (
          <button
            key={epoch}
            onClick={() => handleClaim(epoch)}
            disabled={claiming !== null || isLocked}
            className={`p-5 rounded-xl bg-white border-2 ${
              isLocked
                ? 'border-amber-300 opacity-60 cursor-not-allowed'
                : 'border-green-300 hover:bg-gradient-to-br hover:from-green-100 hover:to-emerald-100 hover:border-green-400 hover:shadow-lg transform hover:scale-105'
            } transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md disabled:transform-none`}
          >
            <div className={`text-xs font-bold uppercase tracking-wide ${isLocked ? 'text-amber-600' : 'text-green-600'} mb-1`}>
              Epoch
            </div>
            <div className={`text-3xl font-black ${isLocked ? 'text-amber-700' : 'text-green-700'}`}>
              #{epoch}
            </div>
            {claiming === epoch ? (
              <div className="text-xs font-semibold text-gray-600 mt-2">Claiming...</div>
            ) : isLocked ? (
              <div className="text-xs font-bold text-amber-600 mt-2 flex items-center justify-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Locked
              </div>
            ) : (
              <div className="text-xs font-bold text-green-600 mt-2">Click to Claim</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
