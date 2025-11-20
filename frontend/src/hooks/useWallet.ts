import { useCallback } from 'react';
import { useWalletStore } from '@/store/walletSlice';
import { walletService } from '@/services/walletService';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import { getSigner } from '@/utils/signerHelper';

export function useWallet() {
  const {
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,
    setWallet,
    setConnecting,
    setNetwork,
    setError,
    disconnect: storeDisconnect,
  } = useWalletStore();

  /**
   * Connect to a wallet using the modal
   */
  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);

      const details = await walletService.openModal();

      // Update store with wallet details
      setWallet(details.address, details.walletId, 'wallet');
      setNetwork(details.network, details.networkPassphrase);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      console.error('Wallet connection error:', err);
      throw err;
    }
  }, [setWallet, setConnecting, setNetwork, setError]);

  /**
   * Connect as a dev player (for testing)
   */
  const connectDev = useCallback(
    async (playerNumber: 1 | 2) => {
      try {
        setConnecting(true);
        setError(null);

        devWalletService.initPlayer(playerNumber);
        const address = devWalletService.getPublicKey();

        // Get network from wallet service
        const { network: net, networkPassphrase: pass } = walletService.getNetwork();

        // Update store
        setWallet(address, `dev-player${playerNumber}`, 'dev');
        setNetwork(net, pass);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect dev wallet';
        setError(errorMessage);
        console.error('Dev wallet connection error:', err);
        throw err;
      }
    },
    [setWallet, setConnecting, setNetwork, setError]
  );

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async () => {
    if (walletType === 'wallet') {
      await walletService.disconnect();
    } else if (walletType === 'dev') {
      devWalletService.disconnect();
    }
    storeDisconnect();
  }, [walletType, storeDisconnect]);

  /**
   * Get a signer for contract interactions
   */
  const getContractSigner = useCallback(() => {
    if (!isConnected || !publicKey || !walletType) {
      throw new Error('Wallet not connected');
    }

    return getSigner(walletType, publicKey);
  }, [isConnected, publicKey, walletType]);

  /**
   * Sign a transaction (direct method for backward compatibility)
   * Returns { signedTxXdr: string; signerAddress?: string; error?: WalletError }
   */
  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!isConnected || !publicKey || !walletType) {
        throw new Error('Wallet not connected');
      }

      try {
        if (walletType === 'dev') {
          return await devWalletService.signTransaction(xdr);
        } else {
          return await walletService.signTransaction(xdr, { address: publicKey });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sign transaction';
        setError(errorMessage);
        throw err;
      }
    },
    [isConnected, publicKey, walletType, setError]
  );

  /**
   * Check if dev mode is available
   */
  const isDevModeAvailable = useCallback(() => {
    return DevWalletService.isDevModeAvailable();
  }, []);

  /**
   * Check if a specific dev player is available
   */
  const isDevPlayerAvailable = useCallback((playerNumber: 1 | 2) => {
    return DevWalletService.isPlayerAvailable(playerNumber);
  }, []);

  return {
    // State
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,

    // Actions
    connect,
    connectDev,
    disconnect,
    signTransaction,
    getContractSigner,
    isDevModeAvailable,
    isDevPlayerAvailable,
  };
}
