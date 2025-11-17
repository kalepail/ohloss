import { useState } from 'react';
import { feeVaultService } from '@/services/feeVaultService';
import { USDC_DECIMALS } from '@/utils/constants';
import { contract } from '@stellar/stellar-sdk';

interface DepositFormProps {
  userAddress: string;
  onSign: () => Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>;
  onSuccess?: () => void;
}

export function DepositForm({ userAddress, onSign, onSuccess }: DepositFormProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const parseAmount = (value: string): bigint | null => {
    try {
      // Remove any non-numeric characters except decimal point
      const cleaned = value.replace(/[^\d.]/g, '');
      if (!cleaned || cleaned === '.') return null;

      // Split into whole and fractional parts
      const [whole = '0', fraction = ''] = cleaned.split('.');

      // Pad or truncate fraction to exactly USDC_DECIMALS places
      const paddedFraction = fraction.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);

      // Combine and convert to bigint
      const combined = whole + paddedFraction;
      return BigInt(combined);
    } catch {
      return null;
    }
  };

  const handleDeposit = async () => {
    try {
      setLoading(true);
      setError(null);
      setTxHash(null);

      const amountBigInt = parseAmount(amount);
      if (!amountBigInt || amountBigInt <= 0n) {
        throw new Error('Please enter a valid amount');
      }

      // Execute deposit with signing
      await feeVaultService.deposit(userAddress, amountBigInt, onSign());

      setTxHash('Transaction submitted successfully');
      setAmount('');
      onSuccess?.();
    } catch (err) {
      console.error('Deposit error:', err);
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Deposit USDC</h3>

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
          <p className="text-xs text-gray-500 mt-1">
            Minimum: 0.01 USDC (for testing)
          </p>
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
          onClick={handleDeposit}
          disabled={loading || !amount}
          className="btn-primary w-full"
        >
          {loading ? 'Depositing...' : 'Deposit'}
        </button>
      </div>
    </div>
  );
}
