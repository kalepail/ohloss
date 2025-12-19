import { Client as OhlossClient } from 'ohloss';
import { OHLOSS_CONTRACT, NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS, DEFAULT_AUTH_TTL_MINUTES } from '@/utils/constants';
import { contract, scValToNative } from '@stellar/stellar-sdk';
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';
import { calculateValidUntilLedger } from '@/utils/ledgerUtils';

type ClientOptions = contract.ClientOptions;

/**
 * Service for interacting with the Ohloss contract
 */
export class OhlossService {
  private baseClient: OhlossClient;

  constructor() {
    // Base client for read-only operations
    this.baseClient = new OhlossClient({
      contractId: OHLOSS_CONTRACT,
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
  ): OhlossClient {
    const options: ClientOptions = {
      contractId: OHLOSS_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    };
    return new OhlossClient(options);
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
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.select_faction({
      player: playerAddress,
      faction: factionId,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    const { result } = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);
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
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
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

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    const { result } = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);
    return result;
  }

  /**
   * Claim epoch rewards for a player
   * Returns the amount claimed
   */
  async claimEpochReward(
    playerAddress: string,
    epochNumber: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<bigint> {
    try {
      const client = this.createSigningClient(playerAddress, signer);
      const tx = await client.claim_epoch_reward({
        player: playerAddress,
        epoch: epochNumber,
      }, DEFAULT_METHOD_OPTIONS);

      // Simulate to ensure proper footprint
      await tx.simulate();

      const validUntilLedgerSeq = authTtlMinutes
        ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
        : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

      const sentTx = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);

      // Check transaction status before accessing result
      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractTransactionError(sentTx.getTransactionResponse, 'claim epoch reward');
        throw new Error(`Failed to claim epoch reward: ${errorMessage}`);
      }

      // Parse the result from the transaction response
      // The contract returns Result<i128, Error> (USDC claimed amount)
      if (sentTx.result) {
        // Use scValToNative to decode the result
        const decoded = scValToNative(sentTx.result as any);
        console.log('Decoded claim_epoch_reward result:', decoded);

        // Result<i128, Error> unwrapping
        if (typeof decoded === 'bigint') {
          return decoded;
        }
        if (typeof decoded === 'number') {
          return BigInt(decoded);
        }
        if (typeof decoded === 'string') {
          return BigInt(decoded);
        }
        if (typeof decoded === 'object' && decoded !== null && 'unwrap' in decoded) {
          return BigInt((decoded as any).unwrap());
        }
        if (typeof decoded === 'object' && decoded !== null && 'Ok' in decoded) {
          return BigInt((decoded as any).Ok);
        }

        return BigInt(decoded);
      }

      throw new Error('No result returned from claim_epoch_reward');
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
      const client = new OhlossClient({
        contractId: OHLOSS_CONTRACT,
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
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<number> {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.cycle_epoch(DEFAULT_METHOD_OPTIONS);

    // Simulate to ensure proper footprint
    await tx.simulate();

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    try {
      const sentTx = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);

      // Check transaction status before accessing result
      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractTransactionError(sentTx.getTransactionResponse, 'cycle epoch');
        throw new Error(`Failed to cycle epoch: ${errorMessage}`);
      }

      // Parse the result from the transaction response
      // The contract returns Result<u32, Error>, so we need to decode it
      if (sentTx.result) {
        // Use scValToNative to decode the result
        const decoded = scValToNative(sentTx.result as any);
        console.log('Decoded cycle_epoch result:', decoded);

        // Result<u32, Error> unwrapping
        if (typeof decoded === 'number') {
          return decoded;
        }
        if (typeof decoded === 'object' && decoded !== null && 'unwrap' in decoded) {
          return Number((decoded as any).unwrap());
        }
        if (typeof decoded === 'object' && decoded !== null && 'Ok' in decoded) {
          return Number((decoded as any).Ok);
        }

        return Number(decoded);
      }

      throw new Error('No result returned from cycle_epoch');
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
export const ohlossService = new OhlossService();
