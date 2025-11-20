import type { ContractSigner } from '@/types/signer';
import { walletService } from '@/services/walletService';
import { devWalletService } from '@/services/devWalletService';

/**
 * Get a signer for wallet-connected users
 * Returns a ContractSigner that uses the Stellar Wallets Kit
 */
export function getWalletSigner(publicKey: string): ContractSigner {
  return {
    signTransaction: async (xdr: string, opts?: {
      networkPassphrase?: string;
      address?: string;
      submit?: boolean;
      submitUrl?: string;
    }) => {
      // Pass through the address from opts, falling back to the publicKey from store
      const signingAddress = opts?.address || publicKey;
      return await walletService.signTransaction(xdr, signingAddress);
    },
    signAuthEntry: async (authEntry: string, opts?: {
      networkPassphrase?: string;
      address?: string;
    }) => {
      // Pass through the address from opts, falling back to the publicKey from store
      const signingAddress = opts?.address || publicKey;
      const result = await walletService.signAuthEntry(authEntry, signingAddress);

      return {
        ...result,
        signedAuthEntry: result.signedAuthEntry,
      }
    },
  };
}

/**
 * Get a signer for dev mode users
 * Returns a ContractSigner that uses the dev wallet service
 */
export function getDevSigner(): ContractSigner {
  return devWalletService.getSigner();
}

/**
 * Get a signer based on the wallet type
 * This is the main function to use in your app
 */
export function getSigner(walletType: 'dev' | 'wallet', publicKey: string): ContractSigner {
  if (walletType === 'dev') {
    return getDevSigner();
  } else {
    return getWalletSigner(publicKey);
  }
}
