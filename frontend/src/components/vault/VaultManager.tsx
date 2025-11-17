import { useState } from 'react';
import { VaultBalance } from './VaultBalance';
import { DepositForm } from './DepositForm';
import { WithdrawForm } from './WithdrawForm';
import { devWalletService } from '@/services/devWalletService';

export function VaultManager() {
  const [activePlayer, setActivePlayer] = useState<1 | 2 | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePlayerSelect = (playerNumber: 1 | 2) => {
    devWalletService.initPlayer(playerNumber);
    setActivePlayer(playerNumber);
  };

  const getSigner = () => {
    return devWalletService.getSigner();
  };

  const handleSuccess = () => {
    // Trigger a refresh of the balance by updating the key
    setRefreshKey(prev => prev + 1);
  };

  if (!activePlayer) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Vault Manager (Dev Mode)</h1>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Select Dev Player</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handlePlayerSelect(1)}
              className="btn-primary p-6"
            >
              <div className="text-lg font-bold">Player 1</div>
              <div className="text-xs mt-2 opacity-80">
                {import.meta.env.VITE_DEV_PLAYER1_PUBLIC?.slice(0, 10)}...
              </div>
            </button>

            <button
              onClick={() => handlePlayerSelect(2)}
              className="btn-primary p-6"
            >
              <div className="text-lg font-bold">Player 2</div>
              <div className="text-xs mt-2 opacity-80">
                {import.meta.env.VITE_DEV_PLAYER2_PUBLIC?.slice(0, 10)}...
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const userAddress = devWalletService.getPublicKey();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Vault Manager</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-600 dark:text-gray-400">Active: </span>
            <span className="font-semibold">Player {activePlayer}</span>
          </div>
          <button
            onClick={() => {
              devWalletService.disconnect();
              setActivePlayer(null);
            }}
            className="btn-secondary text-sm"
          >
            Switch Player
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Balance Display */}
        <div>
          <VaultBalance key={refreshKey} userAddress={userAddress} />
        </div>

        {/* Deposit Form */}
        <div>
          <DepositForm
            userAddress={userAddress}
            onSign={getSigner}
            onSuccess={handleSuccess}
          />
        </div>

        {/* Withdraw Form */}
        <div>
          <WithdrawForm
            userAddress={userAddress}
            onSign={getSigner}
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </div>
  );
}
