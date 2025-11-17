import { useEffect, useState } from 'react';
import { feeVaultService } from '@/services/feeVaultService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { USDC_DECIMALS } from '@/utils/constants';

interface VaultBalanceProps {
  userAddress: string;
}

export function VaultBalance({ userAddress }: VaultBalanceProps) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [shares, setShares] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    loadBalance(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [userAddress]);

  const loadBalance = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);

      const [userBalance, userShares] = await Promise.all([
        requestCache.dedupe(
          createCacheKey('vault-balance', userAddress),
          () => feeVaultService.getUserBalance(userAddress),
          30000,
          signal
        ),
        requestCache.dedupe(
          createCacheKey('vault-shares', userAddress),
          () => feeVaultService.getUserShares(userAddress),
          30000,
          signal
        ),
      ]);

      setBalance(userBalance);
      setShares(userShares);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Error loading vault balance:', err);
        setError(err instanceof Error ? err.message : 'Failed to load balance');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatBalance = (amount: bigint) => {
    const divisor = BigInt(10 ** USDC_DECIMALS);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    return `${whole}.${fraction.toString().padStart(USDC_DECIMALS, '0')}`;
  };

  if (loading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Vault Balance</h3>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-red-500">
        <h3 className="text-lg font-semibold mb-4 text-red-600 dark:text-red-400">
          Error Loading Balance
        </h3>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={() => {
            requestCache.invalidate(createCacheKey('vault-balance', userAddress));
            requestCache.invalidate(createCacheKey('vault-shares', userAddress));
            loadBalance();
          }}
          className="mt-4 btn-secondary text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Vault Balance</h3>

      <div className="space-y-3">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Deposited (bTokens)</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatBalance(balance)} USDC
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Shares Owned</div>
          <div className="text-lg font-semibold">
            {formatBalance(shares)}
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          // Invalidate cache to force fresh data on manual refresh
          requestCache.invalidate(createCacheKey('vault-balance', userAddress));
          requestCache.invalidate(createCacheKey('vault-shares', userAddress));
          loadBalance();
        }}
        className="mt-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        Refresh
      </button>
    </div>
  );
}
