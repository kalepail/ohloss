import { Keypair, contract } from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from '@/utils/constants';

/**
 * Dev wallet service for automated testing
 * WARNING: DO NOT USE IN PRODUCTION
 */
export class DevWalletService {
  private keypair: Keypair | null = null;

  /**
   * Initialize with a dev player (player1 or player2)
   */
  initPlayer(playerNumber: 1 | 2) {
    const secretKey =
      playerNumber === 1
        ? import.meta.env.VITE_DEV_PLAYER1_SECRET
        : import.meta.env.VITE_DEV_PLAYER2_SECRET;

    if (!secretKey) {
      throw new Error(`Dev player${playerNumber} secret not found in environment`);
    }

    this.keypair = Keypair.fromSecret(secretKey);
  }

  /**
   * Get the public key of the current dev wallet
   */
  getPublicKey(): string {
    if (!this.keypair) {
      throw new Error('Dev wallet not initialized. Call initPlayer() first.');
    }
    return this.keypair.publicKey();
  }

  /**
   * Get signer functions for contract client
   * Returns an object with signTransaction and signAuthEntry functions
   */
  getSigner() {
    if (!this.keypair) {
      throw new Error('Dev wallet not initialized. Call initPlayer() first.');
    }

    // Use SDK's basicNodeSigner for consistent signing
    return contract.basicNodeSigner(this.keypair, NETWORK_PASSPHRASE);
  }

  /**
   * Sign a transaction XDR (for backwards compatibility)
   */
  async signTransaction(xdr: string) {
    if (!this.keypair) {
      throw new Error('Dev wallet not initialized. Call initPlayer() first.');
    }

    const signer = contract.basicNodeSigner(this.keypair, NETWORK_PASSPHRASE);
    return await signer.signTransaction(xdr);
  }

  /**
   * Check if dev wallets are available (for development mode detection)
   */
  static isDevModeAvailable(): boolean {
    return !!(
      import.meta.env.VITE_DEV_PLAYER1_SECRET && import.meta.env.VITE_DEV_PLAYER2_SECRET
    );
  }

  /**
   * Disconnect (clear the keypair)
   */
  disconnect() {
    this.keypair = null;
  }
}

// Export singleton instance
export const devWalletService = new DevWalletService();
