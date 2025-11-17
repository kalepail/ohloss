import { useState } from 'react';
import { feeVaultService } from '@/services/feeVaultService';
import { USDC_DECIMALS } from '@/utils/constants';
import { contract } from '@stellar/stellar-sdk';

interface WithdrawFormProps {
  userAddress: string;
  onSign: () => Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>;
  onSuccess?: () => void;
}

export function WithdrawForm({ userAddress, onSign, onSuccess }: WithdrawFormProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const parseAmount = (value: string): bigint | null => {
    try {
      const cleaned = value.replace(/[^\d.]/g, '');
      if (!cleaned || cleaned === '.') return null;

      const [whole = '0', fraction = ''] = cleaned.split('.');
      const paddedFraction = fraction.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);
      const combined = whole + paddedFraction;
      return BigInt(combined);
    } catch {
      return null;
    }
  };

  const handleWithdraw = async () => {
    try {
      setLoading(true);
      setError(null);
      setTxHash(null);

      const amountBigInt = parseAmount(amount);
      if (!amountBigInt || amountBigInt <= 0n) {
        throw new Error('Please enter a valid amount');
      }

      // Execute withdraw with signing
      await feeVaultService.withdraw(userAddress, amountBigInt, onSign());

      setTxHash('Transaction submitted successfully');
      setAmount('');
      onSuccess?.();
    } catch (err) {
      console.error('Withdraw error:', err);
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Withdraw USDC</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Amount (USDC)
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.01"
            className="input"
            disabled={loading}
          />
          <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              ⚠️ Withdrawing &gt;50% between epochs resets your time multiplier
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {txHash && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-600 dark:text-green-400">{txHash}</p>
          </div>
        )}

        <button
          onClick={handleWithdraw}
          disabled={loading || !amount}
          className="btn-danger w-full"
        >
          {loading ? 'Withdrawing...' : 'Withdraw'}
        </button>
      </div>
    </div>
  );
}
