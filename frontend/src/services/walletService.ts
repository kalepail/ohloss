import { StellarWalletsKit, Networks, KitEventType } from '@creit-tech/stellar-wallets-kit';
import { sep43Modules } from '@creit-tech/stellar-wallets-kit/modules/utils';
import { NETWORK, NETWORK_PASSPHRASE } from '@/utils/constants';

export interface WalletDetails {
  address: string;
  walletId: string;
  network: string;
  networkPassphrase: string;
}

/**
 * Wallet service using Stellar Wallets Kit v2
 * Supports multiple wallets (Freighter, xBull, Albedo, etc.)
 */
export class WalletService {
  private initialized = false;
  private selectedWalletId: string | null = null;
  private connectedAddress: string | null = null;

  /**
   * Initialize the Stellar Wallets Kit (v2 uses static API)
   */
  private initKit() {
    if (this.initialized) return;

    // Convert NETWORK string to Networks enum value (network passphrase)
    const network = NETWORK.toLowerCase() === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;

    StellarWalletsKit.init({
      network,
      selectedWalletId: this.selectedWalletId || undefined,
      modules: sep43Modules(),
    });

    this.initialized = true;
  }

  /**
   * Ensure kit is initialized before use
   */
  private ensureInitialized() {
    if (!this.initialized) {
      this.initKit();
    }
  }

  /**
   * Open the wallet selection modal
   * Returns the selected wallet details
   */
  async openModal(): Promise<WalletDetails> {
    this.ensureInitialized();

    // Set up event listener before opening modal
    let walletId: string | undefined;
    const unsubscribe = StellarWalletsKit.on(KitEventType.WALLET_SELECTED, (event) => {
      walletId = event.payload.id;
      this.selectedWalletId = event.payload.id || null;
    });

    try {
      // v2 uses authModal() which handles wallet selection and address retrieval
      const { address } = await StellarWalletsKit.authModal();

      // Store the connected address
      this.connectedAddress = address;

      // Clean up listener
      unsubscribe();

      return {
        address,
        walletId: walletId || this.selectedWalletId || 'unknown',
        network: NETWORK,
        networkPassphrase: NETWORK_PASSPHRASE,
      };
    } catch (error) {
      // Clean up listener on error
      unsubscribe();
      throw error;
    }
  }

  /**
   * Connect with a specific wallet ID (if already known from session)
   * Used for reconnecting on page reload
   */
  async connectWithWalletId(walletId: string): Promise<string> {
    this.ensureInitialized();

    try {
      StellarWalletsKit.setWallet(walletId);
      this.selectedWalletId = walletId;

      const { address } = await StellarWalletsKit.getAddress();

      // Store the connected address
      this.connectedAddress = address;

      return address;
    } catch (error) {
      console.error('Error reconnecting wallet:', error);
      throw new Error('Failed to reconnect wallet. Please connect again.');
    }
  }

  /**
   * Sign a transaction XDR
   * Returns { signedTxXdr: string, signerAddress?: string }
   *
   * @param xdr - Transaction XDR to sign
   * @param address - Optional address to sign with (prioritized over connectedAddress)
   */
  async signTransaction(xdr: string, address?: string) {
    this.ensureInitialized();

    if (!this.selectedWalletId) {
      throw new Error('Wallet not connected. Please connect first.');
    }

    // Use provided address or fall back to connectedAddress
    const signingAddress = address || this.connectedAddress;

    if (!signingAddress) {
      throw new Error('No address provided. Please reconnect your wallet.');
    }

    try {
      // Explicitly set the wallet to ensure we use the site-connected wallet
      StellarWalletsKit.setWallet(this.selectedWalletId);

      // Use the provided address (from store/opts) or the stored connected address
      // This ensures we sign with the correct address even if the extension wallet switches
      return await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: signingAddress,
      });
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw error;
    }
  }

  /**
   * Sign an auth entry (for Soroban contracts)
   * Returns { signedAuthEntry: string, signerAddress?: string }
   *
   * NOTE: stellar-wallets-kit v2 already converts Freighter's Buffer response to base64 string
   *
   * @param authEntry - Auth entry to sign
   * @param address - Optional address to sign with (prioritized over connectedAddress)
   */
  async signAuthEntry(authEntry: string, address?: string) {
    this.ensureInitialized();

    if (!this.selectedWalletId) {
      throw new Error('Wallet not connected. Please connect first.');
    }

    // Use provided address or fall back to connectedAddress
    const signingAddress = address || this.connectedAddress;

    if (!signingAddress) {
      throw new Error('No address provided. Please reconnect your wallet.');
    }

    try {
      // Explicitly set the wallet to ensure we use the site-connected wallet
      StellarWalletsKit.setWallet(this.selectedWalletId);

      // Use the provided address (from store/opts) or the stored connected address
      // This is critical for auth entries to ensure we sign with the exact address
      // the user connected with, even if the extension wallet switches accounts
      const result = await StellarWalletsKit.signAuthEntry(authEntry, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: signingAddress,
      });

      return {
        signedAuthEntry: result.signedAuthEntry,
        signerAddress: result.signerAddress,
      };
    } catch (error) {
      console.error('Error signing auth entry:', error);
      // Some wallets don't support signAuthEntry
      if (error instanceof Error) {
        if (error.message.includes('not supported') || error.message.includes('not implemented')) {
          throw new Error(
            'This wallet does not support signing auth entries. ' +
            'Please use dev mode or a compatible wallet.'
          );
        }
      }
      throw error;
    }
  }

  /**
   * Get the current network
   */
  getNetwork(): { network: string; networkPassphrase: string } {
    return {
      network: NETWORK,
      networkPassphrase: NETWORK_PASSPHRASE,
    };
  }

  /**
   * Disconnect the wallet
   */
  async disconnect(): Promise<void> {
    if (this.initialized && this.selectedWalletId) {
      try {
        await StellarWalletsKit.disconnect();
      } catch (error) {
        console.warn('Wallet disconnect not supported or failed:', error);
      }
    }
    this.selectedWalletId = null;
    this.connectedAddress = null;
  }

  /**
   * Get the currently selected wallet ID
   */
  getSelectedWalletId(): string | null {
    return this.selectedWalletId;
  }

  /**
   * Get the currently connected address
   */
  getConnectedAddress(): string | null {
    return this.connectedAddress;
  }

  /**
   * Get the install link for Freighter wallet
   */
  getInstallLink(): string {
    return 'https://www.freighter.app/';
  }
}

// Export singleton instance
export const walletService = new WalletService();
