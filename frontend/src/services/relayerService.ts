/**
 * Relayer Service
 *
 * Handles transaction submission to OpenZeppelin Channels Relayer.
 *
 * Two modes based on environment:
 * - Development (with VITE_RELAYER_API_KEY): Uses ChannelsClient SDK
 * - Production (no API key): Direct fetch to proxy with X-Turnstile-Response header
 *
 * Pattern based on: https://github.com/kalepail/kale-site/blob/farm/src/utils/passkey-kit.ts
 */

import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels';
import { rpc } from '@stellar/stellar-sdk';
import { RELAYER_URL, RELAYER_API_KEY, RPC_URL } from '@/utils/constants';
import { useTurnstileStore } from '@/store/turnstileSlice';

// Initialize ChannelsClient if we have an API key (development mode)
let channelsClient: ChannelsClient | null = null;
if (RELAYER_URL && RELAYER_API_KEY) {
  channelsClient = new ChannelsClient({
    baseUrl: RELAYER_URL,
    apiKey: RELAYER_API_KEY,
  });
}

interface RelayerResponse {
  hash: string;
  transactionId?: string;
  status?: string;
  success?: boolean;
  error?: string;
}

/**
 * Submit a signed transaction XDR to the Relayer
 */
export async function submitTransaction(
  signedTxXdr: string,
  turnstileToken?: string
): Promise<RelayerResponse> {
  if (!RELAYER_URL) {
    throw new Error('Relayer URL not configured');
  }

  // Development mode: Use ChannelsClient SDK
  if (channelsClient) {
    const result = await channelsClient.submitTransaction({ xdr: signedTxXdr });
    return {
      hash: result.hash,
      transactionId: result.transactionId,
      status: result.status,
    };
  }

  // Production mode: Direct fetch with Turnstile token
  const token = turnstileToken || useTurnstileStore.getState().token;
  if (!token) {
    throw new Error('Turnstile token not available');
  }

  const response = await fetch(RELAYER_URL, {
    method: 'POST',
    headers: {
      'X-Turnstile-Response': token,
    },
    body: new URLSearchParams({ xdr: signedTxXdr }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Relayer submission failed: ${response.status} - ${errorText}`);
  }

  const result: RelayerResponse = await response.json();

  if (result.error) {
    throw new Error(`Relayer error: ${result.error}`);
  }

  return result;
}

/**
 * Submit a transaction and wait for confirmation
 */
export async function submitAndWait(
  signedTxXdr: string,
  turnstileToken: string | undefined,
  rpcServer: rpc.Server,
  timeoutSeconds = 30
): Promise<rpc.Api.GetTransactionResponse> {
  const { hash } = await submitTransaction(signedTxXdr, turnstileToken);

  // Poll for transaction status
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const txResponse = await rpcServer.getTransaction(hash);

      if (txResponse.status === 'SUCCESS' || txResponse.status === 'FAILED') {
        return txResponse;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn('Error polling transaction status:', error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Transaction confirmation timeout after ${timeoutSeconds}s. Hash: ${hash}`);
}

/**
 * Check if Relayer is configured
 */
export function isConfigured(): boolean {
  return !!RELAYER_URL;
}

// Export as singleton-like object for compatibility
export const relayerService = {
  submitTransaction,
  submitAndWait,
  isConfigured,
};
