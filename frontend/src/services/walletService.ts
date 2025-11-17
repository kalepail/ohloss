import {
  isConnected,
  requestAccess,
  getNetworkDetails,
  signTransaction as freighterSignTransaction,
  WatchWalletChanges,
} from '@stellar/freighter-api';
import { NETWORK } from '@/utils/constants';

export interface WalletDetails {
  address: string;
  network: string;
  networkPassphrase: string;
  networkUrl?: string;
  sorobanRpcUrl?: string;
}

export class WalletService {
  private watcher: WatchWalletChanges | null = null;

  /**
   * Check if Freighter extension is installed
   */
  async isFreighterInstalled(): Promise<boolean> {
    try {
      const result = await isConnected();
      return result.isConnected;
    } catch (error) {
      console.error('Error checking Freighter installation:', error);
      return false;
    }
  }

  /**
   * Request access to user's wallet
   * Returns the user's public key if successful
   */
  async connect(): Promise<string> {
    const installed = await this.isFreighterInstalled();
    if (!installed) {
      throw new Error(
        'Freighter wallet is not installed. Please install it from https://www.freighter.app/'
      );
    }

    try {
      const accessObj = await requestAccess();

      if (accessObj.error) {
        throw new Error(accessObj.error);
      }

      if (!accessObj.address) {
        throw new Error('No address returned from Freighter');
      }

      return accessObj.address;
    } catch (error) {
      console.error('Error connecting to Freighter:', error);
      throw error;
    }
  }

  /**
   * Get current network details from Freighter
   */
  async getNetworkDetails(): Promise<WalletDetails> {
    try {
      const details = await getNetworkDetails();
      return {
        address: '', // Address is stored separately in the store
        network: details.network,
        networkPassphrase: details.networkPassphrase,
        networkUrl: details.networkUrl,
        sorobanRpcUrl: details.sorobanRpcUrl,
      };
    } catch (error) {
      console.error('Error getting network details:', error);
      throw error;
    }
  }

  /**
   * Verify the connected network matches the expected network
   */
  async verifyNetwork(): Promise<boolean> {
    try {
      const details = await this.getNetworkDetails();
      const expectedNetwork = NETWORK.toLowerCase();
      const actualNetwork = details.network.toLowerCase();

      return actualNetwork === expectedNetwork;
    } catch (error) {
      console.error('Error verifying network:', error);
      return false;
    }
  }

  /**
   * Sign a transaction XDR with Freighter
   */
  async signTransaction(
    xdr: string,
    networkPassphrase: string,
    address?: string
  ): Promise<string> {
    try {
      const result = await freighterSignTransaction(xdr, {
        networkPassphrase,
        address,
      });

      // Freighter API returns an object with signedTxXdr
      if (typeof result === 'object' && 'signedTxXdr' in result) {
        return result.signedTxXdr;
      }

      // Fallback if it returns a string directly
      return result as string;
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw error;
    }
  }

  /**
   * Watch for wallet changes (address or network changes)
   * Calls the provided callback when changes are detected
   */
  watchWalletChanges(callback: (details: WalletDetails) => void): void {
    // Stop existing watcher if any
    this.stopWatching();

    this.watcher = new WatchWalletChanges(1000); // Poll every 1 second

    this.watcher.watch((changeDetails) => {
      callback({
        address: changeDetails.address,
        network: changeDetails.network,
        networkPassphrase: changeDetails.networkPassphrase,
      });
    });
  }

  /**
   * Stop watching for wallet changes
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }

  /**
   * Get installation link for Freighter
   */
  getInstallLink(): string {
    return 'https://www.freighter.app/';
  }
}

// Export singleton instance
export const walletService = new WalletService();
