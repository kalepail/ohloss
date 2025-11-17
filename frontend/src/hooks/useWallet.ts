import { useEffect, useCallback } from 'react';
import { useWalletStore } from '@/store/walletSlice';
import { walletService, type WalletDetails } from '@/services/walletService';
import { NETWORK } from '@/utils/constants';

export function useWallet() {
  const {
    publicKey,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,
    setPublicKey,
    setConnecting,
    setNetwork,
    setError,
    disconnect: storeDisconnect,
  } = useWalletStore();

  /**
   * Connect to Freighter wallet
   */
  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);

      // Check if Freighter is installed
      const installed = await walletService.isFreighterInstalled();
      if (!installed) {
        throw new Error('Freighter wallet is not installed');
      }

      // Request access to wallet
      const address = await walletService.connect();

      // Get network details
      const networkDetails = await walletService.getNetworkDetails();

      // Verify network matches expected network
      const isCorrectNetwork = await walletService.verifyNetwork();
      if (!isCorrectNetwork) {
        throw new Error(
          `Please switch to ${NETWORK} network in Freighter. Current network: ${networkDetails.network}`
        );
      }

      // Update store
      setPublicKey(address);
      setNetwork(networkDetails.network, networkDetails.networkPassphrase);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      console.error('Wallet connection error:', err);
      throw err;
    }
  }, [setPublicKey, setConnecting, setNetwork, setError]);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(() => {
    walletService.stopWatching();
    storeDisconnect();
  }, [storeDisconnect]);

  /**
   * Sign a transaction
   */
  const signTransaction = useCallback(
    async (xdr: string, passphrase?: string): Promise<string> => {
      if (!isConnected || !publicKey) {
        throw new Error('Wallet not connected');
      }

      const passphraseToUse = passphrase || networkPassphrase;
      if (!passphraseToUse) {
        throw new Error('Network passphrase not available');
      }

      try {
        return await walletService.signTransaction(xdr, passphraseToUse, publicKey);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sign transaction';
        setError(errorMessage);
        throw err;
      }
    },
    [isConnected, publicKey, networkPassphrase, setError]
  );

  /**
   * Watch for wallet changes (account or network switching)
   */
  useEffect(() => {
    if (!isConnected) return;

    walletService.watchWalletChanges((details: WalletDetails) => {
      // If address changed, update it
      if (details.address && details.address !== publicKey) {
        setPublicKey(details.address);
      }

      // If network changed, verify it matches expected network
      if (details.network) {
        const expectedNetwork = NETWORK.toLowerCase();
        const actualNetwork = details.network.toLowerCase();

        if (actualNetwork !== expectedNetwork) {
          setError(
            `Network mismatch! Please switch to ${NETWORK} network in Freighter. Current: ${details.network}`
          );
        } else {
          setNetwork(details.network, details.networkPassphrase);
          // Clear error if network is now correct
          if (error?.includes('Network mismatch')) {
            setError(null);
          }
        }
      }
    });

    return () => {
      walletService.stopWatching();
    };
  }, [isConnected, publicKey, error, setPublicKey, setNetwork, setError]);

  /**
   * Get Freighter installation link
   */
  const getInstallLink = useCallback(() => {
    return walletService.getInstallLink();
  }, []);

  return {
    // State
    publicKey,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,

    // Actions
    connect,
    disconnect,
    signTransaction,
    getInstallLink,
  };
}
