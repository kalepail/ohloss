import { Client as FeeVaultClient } from '../../../bunt/bindings/fee-vault/dist/index';
import { VAULT_CONTRACT, NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS } from '@/utils/constants';
import { contract } from '@stellar/stellar-sdk';

type ClientOptions = contract.ClientOptions;

/**
 * Service for interacting with the fee-vault-v2 contract
 */
export class FeeVaultService {
  private baseClient: FeeVaultClient;

  constructor() {
    // Base client for read-only operations
    this.baseClient = new FeeVaultClient({
      contractId: VAULT_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }

  /**
   * Create a client with signing capabilities
   */
  private createSigningClient(
    publicKey: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): FeeVaultClient {
    const options: ClientOptions = {
      contractId: VAULT_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer, // Spread the signer object to include both signTransaction and signAuthEntry
    };
    return new FeeVaultClient(options);
  }

  /**
   * Get vault summary (for display purposes)
   */
  async getVaultSummary() {
    const tx = await this.baseClient.get_vault_summary();
    const result = await tx.simulate();
    return result.result;
  }

  /**
   * Get user's underlying token balance (their vault position in BLND)
   */
  async getUserBalance(userAddress: string): Promise<bigint> {
    const tx = await this.baseClient.get_underlying_tokens({ user: userAddress });
    const result = await tx.simulate();
    return BigInt(result.result);
  }

  /**
   * Get user's share balance
   */
  async getUserShares(userAddress: string): Promise<bigint> {
    const tx = await this.baseClient.get_shares({ user: userAddress });
    const result = await tx.simulate();
    return BigInt(result.result);
  }

  /**
   * Get vault data
   */
  async getVaultData() {
    const tx = await this.baseClient.get_vault();
    const result = await tx.simulate();
    return result.result;
  }

  /**
   * Deposit tokens into the vault
   * Executes the full transaction with signing and submission
   */
  async deposit(
    userAddress: string,
    amount: bigint,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(userAddress, signer);
    const tx = await client.deposit({ user: userAddress, amount }, DEFAULT_METHOD_OPTIONS);
    const { result } = await tx.signAndSend();
    return result;
  }

  /**
   * Withdraw tokens from the vault
   * Executes the full transaction with signing and submission
   */
  async withdraw(
    userAddress: string,
    amount: bigint,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(userAddress, signer);
    const tx = await client.withdraw({ user: userAddress, amount }, DEFAULT_METHOD_OPTIONS);
    const { result } = await tx.signAndSend();
    return result;
  }
}

// Export singleton instance
export const feeVaultService = new FeeVaultService();
