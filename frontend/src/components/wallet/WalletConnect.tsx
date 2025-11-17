import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { cn } from '@/utils/cn';
import { Wallet, AlertCircle, ExternalLink } from 'lucide-react';

export function WalletConnect() {
  const { connect, isConnecting, error, getInstallLink } = useWallet();
  const [showError, setShowError] = useState(true);

  const handleConnect = async () => {
    try {
      setShowError(true);
      await connect();
    } catch (err) {
      // Error is already set in the store
      console.error('Connection failed:', err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={cn(
          'btn-primary flex items-center gap-2 justify-center min-w-[160px]',
          isConnecting && 'opacity-75 cursor-wait'
        )}
      >
        <Wallet className="w-5 h-5" />
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {error && showError && (
        <div className="glass-card border-red-500/50 bg-red-500/10 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-100 dark:text-red-200">{error}</p>
              {error.includes('not installed') && (
                <a
                  href={getInstallLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-red-200 hover:text-red-100 transition-colors"
                >
                  Install Freighter
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => setShowError(false)}
              className="text-red-200 hover:text-red-100 transition-colors text-sm"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
