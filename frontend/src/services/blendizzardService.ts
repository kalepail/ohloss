import { Client as BlendizzardClient } from '../../../bunt/bindings/blendizzard/dist/index';
import { BLENDIZZARD_CONTRACT, NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';
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
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
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
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ) {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.select_faction({
      player: playerAddress,
      faction: factionId,
    });
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
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ) {
    const client = this.createSigningClient(player1, signer);
    const tx = await client.start_game({
      game_id: gameId,
      session_id: sessionId,
      player1,
      player2,
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    });
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
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ): Promise<bigint> {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.claim_epoch_reward({
      player: playerAddress,
      epoch: epochNumber,
    });
    const { result } = await tx.signAndSend();
    return result;
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
      const tx = await this.baseClient.claim_epoch_reward({
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
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ): Promise<number> {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.cycle_epoch();
    const { result } = await tx.signAndSend();
    return result;
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
