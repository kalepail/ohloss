import { Client as NumberGuessClient, type Game } from '../../../bunt/bindings/number-guess/dist/index';
import { GAME_CONTRACT, NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';
import { contract } from '@stellar/stellar-sdk';

type ClientOptions = contract.ClientOptions;

/**
 * Service for interacting with the NumberGuess game contract
 */
export class NumberGuessService {
  private baseClient: NumberGuessClient;

  constructor() {
    // Base client for read-only operations
    this.baseClient = new NumberGuessClient({
      contractId: GAME_CONTRACT,
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
  ): NumberGuessClient {
    const options: ClientOptions = {
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    };
    return new NumberGuessClient(options);
  }

  /**
   * Get game state
   */
  async getGame(sessionId: number): Promise<Game> {
    const tx = await this.baseClient.get_game({ session_id: sessionId });
    const result = await tx.simulate();
    return result.result.unwrap();
  }

  /**
   * Start a new game (requires multi-sig authorization)
   * Note: This requires both players to sign the transaction
   */
  async startGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Wager: bigint,
    player2Wager: bigint,
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ) {
    const client = this.createSigningClient(player1, signer);
    const tx = await client.start_game({
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
   * Prepare a start game transaction and return partially signed XDR
   * Player 1 creates and signs the transaction, then exports XDR for Player 2
   */
  async prepareStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Wager: bigint,
    player2Wager: bigint,
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ): Promise<string> {
    const client = this.createSigningClient(player1, signer);
    const tx = await client.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    });

    // Sign the transaction but don't send it
    await tx.sign();

    // Export as XDR string
    return tx.toXDR();
  }

  /**
   * Parse transaction XDR to extract game details
   * Shows session ID and wager amounts before signing
   */
  parseStartGameXDR(xdr: string): {
    sessionId: number;
    player1: string;
    player2: string;
    player1Wager: bigint;
    player2Wager: bigint;
  } {
    // This is a simplified parser - in production you'd want to properly decode the XDR
    // For now, we'll just provide a placeholder that shows we can extract this info
    try {
      // The actual parsing would involve decoding the Stellar transaction XDR
      // and extracting the contract invocation parameters
      // This is a placeholder that would need proper XDR parsing
      throw new Error('XDR parsing not yet implemented - transaction details will be shown after import');
    } catch (err) {
      throw new Error('Invalid transaction XDR format');
    }
  }

  /**
   * Import a partially signed transaction XDR, complete signing, and submit
   * Player 2 imports the XDR, signs it, and submits to network
   */
  async importAndCompleteStartGame(
    xdr: string,
    player2Address: string,
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ) {
    const client = this.createSigningClient(player2Address, signer);

    // Import the transaction from XDR
    const tx = client.txFromXDR(xdr);

    // Sign and send the transaction
    const { result } = await tx.signAndSend();
    return result;
  }

  /**
   * Make a guess (1-10)
   */
  async makeGuess(
    sessionId: number,
    playerAddress: string,
    guess: number,
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ) {
    if (guess < 1 || guess > 10) {
      throw new Error('Guess must be between 1 and 10');
    }

    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.make_guess({
      session_id: sessionId,
      player: playerAddress,
      guess,
    });
    const { result } = await tx.signAndSend();
    return result;
  }

  /**
   * Reveal the winner after both players have guessed
   */
  async revealWinner(
    sessionId: number,
    callerAddress: string,
    signer: { signTransaction: (xdr: string) => Promise<string>; signAuthEntry?: any }
  ) {
    const client = this.createSigningClient(callerAddress, signer);
    const tx = await client.reveal_winner({ session_id: sessionId });
    const { result } = await tx.signAndSend();
    return result;
  }
}

// Export singleton instance
export const numberGuessService = new NumberGuessService();
