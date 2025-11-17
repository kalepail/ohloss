import { Client as BlendizzardClient } from '../../../bunt/bindings/blendizzard/dist/index';
import { BLENDIZZARD_CONTRACT, NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS } from '@/utils/constants';
import { contract } from '@stellar/stellar-sdk';

type ClientOptions = contract.ClientOptions;

/**
 * Service for interacting with the Blendizzard contract
 */
export class BlendizzardService {
  private baseClient: BlendizzardClient;

  constructor() {
    // Base client for read-only operations
    this.baseClient = new BlendizzardClient({
      contractId: BLENDIZZARD_CONTRACT,
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
  ): BlendizzardClient {
    const options: ClientOptions = {
      contractId: BLENDIZZARD_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    };
    return new BlendizzardClient(options);
  }

  /**
   * Get the current epoch number
   */
  async getCurrentEpoch(): Promise<number> {
    const tx = await this.baseClient.get_current_epoch();
    const result = await tx.simulate();
    return Number(result.result);
  }

  /**
   * Get epoch information for a specific epoch
   */
  async getEpoch(epochNumber: number) {
    const tx = await this.baseClient.get_epoch({ epoch: epochNumber });
    const result = await tx.simulate();
    return result.result.unwrap();
  }

  /**
   * Get player information
   */
  async getPlayer(playerAddress: string) {
    const tx = await this.baseClient.get_player({ player: playerAddress });
    const result = await tx.simulate();
    return result.result.unwrap();
  }

  /**
   * Get player's epoch-specific information
   */
  async getEpochPlayer(epochNumber: number, playerAddress: string) {
    const tx = await this.baseClient.get_epoch_player({
      epoch: epochNumber,
      player: playerAddress,
    });
    const result = await tx.simulate();
    return result.result.unwrap();
  }

  /**
   * Get contract configuration
   */
  async getConfig() {
    const tx = await this.baseClient.get_config();
    const result = await tx.simulate();
    return result.result;
  }

  /**
   * Select a faction for the player
   */
  async selectFaction(
    playerAddress: string,
    factionId: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.select_faction({
      player: playerAddress,
      faction: factionId,
    }, DEFAULT_METHOD_OPTIONS);
    const { result } = await tx.signAndSend();
    return result;
  }

  /**
   * Start a new game session
   * Note: This requires both players to sign the transaction
   */
  async startGame(
    gameId: string,
    sessionId: number,
    player1: string,
    player2: string,
    player1Wager: bigint,
    player2Wager: bigint,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(player1, signer);
    const tx = await client.start_game({
      game_id: gameId,
      session_id: sessionId,
      player1,
      player2,
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    }, DEFAULT_METHOD_OPTIONS);
    const { result } = await tx.signAndSend();
    return result;
  }

  /**
   * Claim epoch rewards for a player
   * Returns the amount claimed
   */
  async claimEpochReward(
    playerAddress: string,
    epochNumber: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<bigint> {
    try {
      const client = this.createSigningClient(playerAddress, signer);
      const tx = await client.claim_epoch_reward({
        player: playerAddress,
        epoch: epochNumber,
      }, DEFAULT_METHOD_OPTIONS);

      // Simulate to ensure proper footprint
      await tx.simulate();

      const sentTx = await tx.signAndSend();

      // Check transaction status before accessing result
      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractTransactionError(sentTx.getTransactionResponse, 'claim epoch reward');
        throw new Error(`Failed to claim epoch reward: ${errorMessage}`);
      }

      // Extract bigint from Result type
      if (typeof sentTx.result === 'bigint') {
        return sentTx.result;
      }
      // Handle Result<bigint, ErrorMessage> type
      if (sentTx.result && typeof sentTx.result === 'object' && 'unwrap' in sentTx.result) {
        return (sentTx.result as any).unwrap();
      }
      return BigInt(sentTx.result);
    } catch (err) {
      console.error('Claim epoch reward error:', err);

      // Enhance error message with more context
      if (err instanceof Error) {
        if (err.message.includes('timeout')) {
          throw new Error(`Transaction timed out after ${DEFAULT_METHOD_OPTIONS.timeoutInSeconds} seconds. The network may be congested. Please try again.`);
        }
        if (err.message.includes('Transaction simulation failed')) {
          throw new Error(`Cannot claim rewards: ${err.message}`);
        }
        throw err;
      }

      throw new Error('Failed to claim epoch reward - unknown error occurred');
    }
  }

  /**
   * Simulate claiming epoch rewards to check if rewards are claimable
   * Returns true if claimable (simulation succeeds), false otherwise
   */
  async canClaimEpochReward(
    playerAddress: string,
    epochNumber: number
  ): Promise<boolean> {
    try {
      // Create a client with publicKey for proper auth simulation
      const client = new BlendizzardClient({
        contractId: BLENDIZZARD_CONTRACT,
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
        publicKey: playerAddress,
      });

      const tx = await client.claim_epoch_reward({
        player: playerAddress,
        epoch: epochNumber,
      });
      const simResult = await tx.simulate();

      // Check if result is Ok (not Err)
      // Soroban contract results are { result: Ok { value } } or { result: Err { error } }
      const result = simResult.result;
      if (result && typeof result === 'object' && 'error' in result) {
        // This is an Err result - not claimable
        console.log(`Epoch ${epochNumber} NOT claimable (contract error):`, result.error);
        return false;
      }

      if (result !== undefined && result !== null) {
        // This is an Ok result - claimable!
        console.log(`Epoch ${epochNumber} IS claimable, would receive:`, result);
        return true;
      }

      console.log(`Epoch ${epochNumber} simulation succeeded but no result`, simResult);
      return false;
    } catch (error: any) {
      // Simulation failed completely - rewards not claimable
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      console.log(`Epoch ${epochNumber} NOT claimable (simulation failed):`, errorMsg);
      return false;
    }
  }

  /**
   * Cycle to the next epoch
   * Finalizes current epoch and starts new one
   * Returns the new epoch number
   */
  async cycleEpoch(
    playerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<number> {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.cycle_epoch();

    // Simulate to ensure proper footprint
    await tx.simulate();

    try {
      const sentTx = await tx.signAndSend();

      // Check transaction status before accessing result
      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractTransactionError(sentTx.getTransactionResponse, 'cycle epoch');
        throw new Error(`Failed to cycle epoch: ${errorMessage}`);
      }

      // Return the new epoch number - handle Result type unwrapping
      if (typeof sentTx.result === 'number') {
        return sentTx.result;
      }
      // Handle Result<number, ErrorMessage> type
      if (sentTx.result && typeof sentTx.result === 'object' && 'unwrap' in sentTx.result) {
        return Number((sentTx.result as any).unwrap());
      }
      return Number(sentTx.result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Failed to cycle epoch - transaction rejected. Check that epoch has ended and no active games exist.');
      }
      throw err;
    }
  }

  /**
   * Extract error message from failed transaction
   */
  private extractTransactionError(transactionResponse: any, operationName: string): string {
    try {
      console.error(`${operationName} transaction response:`, JSON.stringify(transactionResponse, null, 2));

      // Check for diagnostic events
      const diagnosticEvents = transactionResponse?.diagnosticEventsXdr ||
                              transactionResponse?.diagnostic_events || [];

      for (const event of diagnosticEvents) {
        if (event?.topics) {
          const topics = Array.isArray(event.topics) ? event.topics : [];
          const hasErrorTopic = topics.some((topic: any) =>
            topic?.symbol === 'error' || topic?.error
          );

          if (hasErrorTopic && event.data) {
            if (typeof event.data === 'string') {
              return event.data;
            } else if (event.data.vec && Array.isArray(event.data.vec)) {
              const messages = event.data.vec
                .filter((item: any) => item?.string)
                .map((item: any) => item.string);
              if (messages.length > 0) {
                return messages.join(': ');
              }
            }
          }
        }
      }

      const status = transactionResponse?.status || 'Unknown';
      return `Transaction ${status}. Check console for details.`;
    } catch (err) {
      console.error('Failed to extract cycle error:', err);
      return 'Unknown error occurred';
    }
  }

  /**
   * Check if contract is paused
   */
  async isPaused(): Promise<boolean> {
    const tx = await this.baseClient.is_paused();
    const result = await tx.simulate();
    return result.result;
  }
}

// Export singleton instance
export const blendizzardService = new BlendizzardService();
