import { useWallet } from '@/hooks/useWallet';
import { truncateAddress } from '@/utils/format';
import { cn } from '@/utils/cn';
import { Wallet, LogOut, AlertTriangle, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export function WalletStatus() {
  const { publicKey, network, error, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);

  if (!publicKey) {
    return null;
  }

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect your wallet?')) {
      disconnect();
    }
  };

  const networkColor =
    network?.toLowerCase() === 'mainnet' || network?.toLowerCase() === 'public'
      ? 'bg-green-500'
      : 'bg-yellow-500';

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between gap-4">
        {/* Wallet Icon & Address */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-blue-500" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAddress}
                className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5"
                title="Click to copy address"
              >
                {truncateAddress(publicKey, 6)}
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 opacity-50" />
                )}
              </button>
            </div>

            {network && (
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('w-2 h-2 rounded-full', networkColor)} />
                <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                  {network}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Disconnect Button */}
        <button
          onClick={handleDisconnect}
          className="btn-secondary flex items-center gap-2 flex-shrink-0"
          title="Disconnect wallet"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>

      {/* Network Error Warning */}
      {error && error.includes('Network mismatch') && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-start gap-2 text-yellow-600 dark:text-yellow-500">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
