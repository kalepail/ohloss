import { LAUNCHTUBE_URL, LAUNCHTUBE_JWT } from '@/utils/constants';
import { rpc } from '@stellar/stellar-sdk';

type LaunchtubeHeaders = Record<string, string>;

interface LaunchtubeResponse {
  hash: string;
  status: string;
  successful?: boolean;
  error?: string;
}

/**
 * Service for submitting signed transactions via Launchtube
 * Launchtube provides transaction submission with Cloudflare protection
 */
export class LaunchtubeService {
  private readonly baseUrl: string;
  private readonly jwt: string | undefined;
  private readonly clientName = 'ohloss';
  private readonly clientVersion: string;

  constructor() {
    this.baseUrl = LAUNCHTUBE_URL;
    this.jwt = LAUNCHTUBE_JWT;

    // Get version from package.json (fallback to '0.0.0')
    this.clientVersion = '0.0.1'; // You can import from package.json if needed
  }

  /**
   * Build headers for Launchtube API request
   * Note: Content-Type is not set here as FormData sets it automatically
   */
  private buildHeaders(turnstileToken?: string): LaunchtubeHeaders {
    const headers: LaunchtubeHeaders = {
      'X-Client-Name': this.clientName,
      'X-Client-Version': this.clientVersion,
    };

    // Add JWT authorization if configured
    if (this.jwt) {
      headers.Authorization = `Bearer ${this.jwt}`;
    }

    // Add Turnstile token for anti-bot protection
    if (turnstileToken) {
      headers['X-Turnstile-Response'] = turnstileToken;
    }

    return headers;
  }

  /**
   * Submit a signed transaction XDR to Launchtube via the /v2 endpoint
   * @param signedTxXdr - Signed transaction XDR string
   * @param turnstileToken - Optional Cloudflare Turnstile token for protection
   * @returns Transaction hash and status
   */
  async submitTransaction(
    signedTxXdr: string,
    turnstileToken?: string
  ): Promise<LaunchtubeResponse> {
    try {
      // Create FormData with the transaction XDR
      const formData = new FormData();
      formData.append('xdr', signedTxXdr);

      const response = await fetch(`${this.baseUrl}`, {
        method: 'POST',
        headers: this.buildHeaders(turnstileToken),
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Launchtube submission failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result: LaunchtubeResponse = await response.json();

      if (result.error) {
        throw new Error(`Launchtube error: ${result.error}`);
      }

      return result;
    } catch (error) {
      console.error('Launchtube submission error:', error);
      throw error;
    }
  }

  /**
   * Submit a signed transaction and wait for confirmation
   * This polls the network until the transaction is confirmed or times out
   *
   * @param signedTxXdr - Signed transaction XDR string
   * @param turnstileToken - Optional Cloudflare Turnstile token
   * @param rpcServer - Soroban RPC client for polling status
   * @param timeoutSeconds - Maximum time to wait for confirmation (default: 30s)
   * @returns Transaction result from RPC
   */
  async submitAndWait(
    signedTxXdr: string,
    turnstileToken: string | undefined,
    rpcServer: rpc.Server,
    timeoutSeconds = 30
  ): Promise<rpc.Api.GetTransactionResponse> {
    // Submit to Launchtube
    const { hash } = await this.submitTransaction(signedTxXdr, turnstileToken);

    // Poll for transaction status
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const txResponse = await rpcServer.getTransaction(hash);

        if (txResponse.status === 'SUCCESS' || txResponse.status === 'FAILED') {
          return txResponse;
        }

        // Wait 1 second before next poll
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn('Error polling transaction status:', error);
        // Continue polling on errors
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`Transaction confirmation timeout after ${timeoutSeconds}s. Hash: ${hash}`);
  }

  /**
   * Check if Launchtube is properly configured
   */
  isConfigured(): boolean {
    return !!this.baseUrl;
  }

  /**
   * Get the Launchtube URL being used
   */
  getUrl(): string {
    return this.baseUrl;
  }
}

// Export singleton instance
export const launchtubeService = new LaunchtubeService();
