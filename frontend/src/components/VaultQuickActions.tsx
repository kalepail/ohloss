import { useState, useEffect } from 'react';
import { feeVaultService } from '@/services/feeVaultService';
import { blendizzardService } from '@/services/blendizzardService';
import { balanceService } from '@/services/balanceService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { USDC_DECIMALS } from '@/utils/constants';
import { useWallet } from '@/hooks/useWallet';

interface VaultQuickActionsProps {
  userAddress: string;
  onSuccess: () => void;
  refreshTrigger?: number;
}

export function VaultQuickActions({ userAddress, onSuccess, refreshTrigger = 0 }: VaultQuickActionsProps) {
  const { getContractSigner } = useWallet();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n);
  const [minDepositToClaim, setMinDepositToClaim] = useState<bigint>(0n);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);

  useEffect(() => {
    const abortController = new AbortController();

    const loadData = async () => {
      try {
        // Use requestCache to prevent duplicate calls in React Strict Mode
        const [balance, config, vault] = await Promise.all([
          requestCache.dedupe(
            createCacheKey('usdc-balance', userAddress),
            () => balanceService.getUSDCBalance(userAddress),
            30000,
            abortController.signal
          ),
          requestCache.dedupe(
            createCacheKey('blendizzard-config'),
            () => blendizzardService.getConfig(),
            60000,
            abortController.signal
          ),
          requestCache.dedupe(
            createCacheKey('vault-balance', userAddress),
            () => feeVaultService.getUserBalance(userAddress),
            30000,
            abortController.signal
          ),
        ]);
        setUsdcBalance(balance);
        // Default to 1 USDC (7 decimals) if config field not present (backwards compatibility)
        const minDeposit = config.min_deposit_to_claim ?? 1_0000000n;
        setMinDepositToClaim(BigInt(minDeposit));
        setVaultBalance(vault);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Failed to load balances:', err);
        }
      }
    };

    loadData();

    return () => {
      abortController.abort();
    };
  }, [userAddress, refreshTrigger]);

  const loadBalance = async () => {
    // Invalidate cache to force fresh data after transactions
    requestCache.invalidate(createCacheKey('usdc-balance', userAddress));
    requestCache.invalidate(createCacheKey('vault-balance', userAddress));
    const [balance, vault] = await Promise.all([
      balanceService.getUSDCBalance(userAddress),
      feeVaultService.getUserBalance(userAddress),
    ]);
    setUsdcBalance(balance);
    setVaultBalance(vault);
  };

  const formatBalance = (balance: bigint): string => {
    const divisor = BigInt(10 ** USDC_DECIMALS);
    const whole = balance / divisor;
    const fraction = balance % divisor;

    if (fraction === 0n) {
      return whole.toString();
    }

    const fractionStr = fraction.toString().padStart(USDC_DECIMALS, '0');
    // Remove trailing zeros but keep significant decimals
    const trimmed = fractionStr.replace(/0+$/, '');
    return `${whole}.${trimmed}`;
  };

  const parseAmount = (value: string): bigint | null => {
    try {
      const cleaned = value.replace(/[^\d.]/g, '');
      if (!cleaned || cleaned === '.') return null;

      const [whole = '0', fraction = ''] = cleaned.split('.');
      const paddedFraction = fraction.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);
      return BigInt(whole + paddedFraction);
    } catch {
      return null;
    }
  };

  const handleDeposit = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const amountBigInt = parseAmount(amount);
      if (!amountBigInt || amountBigInt <= 0n) {
        throw new Error('Enter a valid amount');
      }

      const signer = getContractSigner();
      await feeVaultService.deposit(userAddress, amountBigInt, signer);

      setSuccess('Deposited successfully!');
      setAmount('');
      await loadBalance();
      onSuccess();
    } catch (err) {
      console.error('Deposit error:', err);
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const amountBigInt = parseAmount(amount);
      if (!amountBigInt || amountBigInt <= 0n) {
        throw new Error('Enter a valid amount');
      }

      const signer = getContractSigner();
      await feeVaultService.withdraw(userAddress, amountBigInt, signer);

      setSuccess('Withdrawn successfully!');
      setAmount('');
      await loadBalance();
      onSuccess();
    } catch (err) {
      console.error('Withdraw error:', err);
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-green-100 hover:shadow-xl transition-shadow">
      <h3 className="text-lg font-bold mb-4 text-gray-900">
        Vault Actions
      </h3>

      <div className="space-y-4">
        {/* USDC Wallet Balance */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
          <div className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-1">
            USDC Wallet Balance
          </div>
          <div className="text-2xl font-black text-blue-700">
            {formatBalance(usdcBalance)}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-2">
            Amount (USDC)
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.01"
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all text-gray-900 font-medium placeholder-gray-400"
          />
        </div>

        {error && (
          <div className="p-3 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
            <p className="text-xs font-semibold text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
            <p className="text-xs font-semibold text-green-700">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDeposit}
            disabled={loading || !amount}
            className="px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold text-sm disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            {loading ? '...' : 'Deposit'}
          </button>
          <button
            onClick={handleWithdraw}
            disabled={loading || !amount}
            className="px-4 py-3 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold text-sm disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            {loading ? '...' : 'Withdraw'}
          </button>
        </div>

        <div className="pt-3 border-t-2 border-gray-100 space-y-2">
          <p className="text-xs font-medium text-gray-600">
            ⚠️ Withdrawing &gt;50% between epochs resets your time multiplier
          </p>
          {minDepositToClaim > 0n && vaultBalance < minDepositToClaim && (
            <p className="text-xs font-medium text-amber-600">
              💡 Deposit at least {formatBalance(minDepositToClaim)} USDC to unlock reward claiming
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
