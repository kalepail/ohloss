import { WalletConnect } from '@/components/wallet/WalletConnect';
import { WalletStatus } from '@/components/wallet/WalletStatus';
import { useWallet } from '@/hooks/useWallet';

export function Navbar() {
  const { isConnected } = useWallet();

  return (
    <nav className="glass border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Ohloss
            </div>
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
              Faction Gaming
            </span>
          </div>

          {/* Wallet Section */}
          <div>{isConnected ? <WalletStatus /> : <WalletConnect />}</div>
        </div>
      </div>
    </nav>
  );
}
