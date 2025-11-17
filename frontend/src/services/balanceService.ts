import { Client as SACClient } from 'sac-sdk';
import { RPC_URL, NETWORK_PASSPHRASE, XLM_TOKEN, USDC_TOKEN } from '@/utils/constants';

/**
 * Service for fetching token and native balances using SAC SDK
 */
export class BalanceService {
  private xlmClient: SACClient;
  private usdcClient: SACClient;

  constructor() {
    // Initialize SAC clients for each token
    this.xlmClient = new SACClient({
      contractId: XLM_TOKEN,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });

    this.usdcClient = new SACClient({
      contractId: USDC_TOKEN,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }

  /**
   * Get USDC balance for an address using SAC SDK
   * Returns balance in stroops (7 decimals)
   */
  async getUSDCBalance(address: string): Promise<bigint> {
    try {
      const tx = await this.usdcClient.balance({ id: address });
      const simResult = await tx.simulate();
      return BigInt(simResult.result);
    } catch (error) {
      console.error('Failed to fetch USDC balance:', error);
      return 0n;
    }
  }

  /**
   * Get native XLM balance for an address using SAC SDK
   * Returns balance in stroops (7 decimals)
   */
  async getXLMBalance(address: string): Promise<bigint> {
    try {
      const tx = await this.xlmClient.balance({ id: address });
      const simResult = await tx.simulate();
      return BigInt(simResult.result);
    } catch (error) {
      console.error('Failed to fetch XLM balance:', error);
      return 0n;
    }
  }

  /**
   * Get both USDC and XLM balances in parallel
   */
  async getAllBalances(address: string): Promise<{ usdc: bigint; xlm: bigint }> {
    const [usdc, xlm] = await Promise.all([
      this.getUSDCBalance(address),
      this.getXLMBalance(address),
    ]);

    return { usdc, xlm };
  }
}

// Export singleton instance
export const balanceService = new BalanceService();
