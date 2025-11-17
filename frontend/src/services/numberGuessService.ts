import { Client as NumberGuessClient, type Game } from '../../../bunt/bindings/number-guess/dist/index';
import { GAME_CONTRACT, NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS } from '@/utils/constants';
import { contract, TransactionBuilder, StrKey } from '@stellar/stellar-sdk';

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
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
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
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(player1, signer);
    const tx = await client.start_game({
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
   * STEP 1 (Player 1): Prepare a start game transaction
   * - Creates transaction with Player 2 as the transaction source
   * - Player 1 discovers what needs to be signed using needsNonInvokerSigningBy()
   * - Player 1 signs their part (likely auth entry since they're not the source)
   * - Returns partially-signed XDR for Player 2 to import and complete
   *
   * Based on pattern from stellar-sdk swap.test.ts multi-auth flow
   */
  async prepareStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Wager: bigint,
    player2Wager: bigint,
    player1Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<string> {
    // Step 1: Build transaction with Player 2 as the source
    // Use a client without signer just for building
    const buildClient = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player2, // Player 2 will be the transaction source
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    }, DEFAULT_METHOD_OPTIONS);

    // Step 2: Player 1 imports and signs what they need to sign
    const player1Client = this.createSigningClient(player1, player1Signer);
    const player1Tx = player1Client.txFromXDR(tx.toXDR());

    // Discover what Player 1 needs to sign
    const needsSigning = await player1Tx.needsNonInvokerSigningBy();
    console.log('Accounts that need to sign auth entries:', needsSigning);

    // Player 1 signs if they're in the needsSigning list
    if (needsSigning.includes(player1)) {
      await player1Tx.signAuthEntries();
    }

    // Export partially-signed XDR for Player 2
    return player1Tx.toXDR();
  }

  /**
   * STEP 2 (Player 2): Import transaction, check and sign auth entry if needed
   * - Imports the XDR from Player 1
   * - Checks if Player 2 needs to sign an auth entry using needsNonInvokerSigningBy()
   * - If Player 2 is the transaction source, they may not need an auth entry
   *   (authorization comes from source_account credential)
   * - Returns updated XDR or original if no signing needed
   *
   * Player 2 should review session ID and wager amounts before signing
   */
  async importAndSignAuthEntry(
    xdr: string,
    player2Address: string,
    player2Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<string> {
    const client = this.createSigningClient(player2Address, player2Signer);

    // Import the transaction from XDR
    const tx = client.txFromXDR(xdr);

    // Check if Player 2 needs to sign an auth entry
    const needsSigning = await tx.needsNonInvokerSigningBy();
    console.log('Accounts that still need to sign auth entries:', needsSigning);

    // Player 2 signs their auth entry only if they're in the needsSigning list
    if (needsSigning.includes(player2Address)) {
      await tx.signAuthEntries();
    }

    // Export updated XDR
    return tx.toXDR();
  }

  /**
   * STEP 3 (Player 1 or Player 2): Finalize and submit the transaction
   * - Imports the fully-signed XDR
   * - Re-simulates (REQUIRED after auth entries are signed)
   * - Signs transaction envelope and submits to network
   *
   * Can be called by either player, but typically Player 2 (the transaction source)
   */
  async finalizeStartGame(
    xdr: string,
    signerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(signerAddress, signer);

    // Import the transaction with all auth entries signed
    const tx = client.txFromXDR(xdr);

    // CRITICAL: Must simulate again after auth entries are signed
    // This updates the transaction with the signed auth entries
    await tx.simulate();

    // Sign the transaction envelope and submit
    const { result } = await tx.signAndSend();
    return result;
  }

  /**
   * Helper: Check which signatures are still needed
   * Returns array of addresses that need to sign auth entries
   */
  async checkRequiredSignatures(
    xdr: string,
    publicKey: string
  ): Promise<string[]> {
    const client = this.createSigningClient(publicKey, {
      signTransaction: async (xdr: string) => ({ signedTxXdr: xdr }),
      signAuthEntry: async (xdr: string) => ({ signedAuthEntry: xdr }),
    });

    const tx = client.txFromXDR(xdr);

    // Returns array of addresses that need to sign their auth entries
    const needsSigning = await tx.needsNonInvokerSigningBy();
    return needsSigning;
  }

  /**
   * Parse transaction XDR to extract game details
   * Returns session ID, player addresses, wagers, and transaction source
   * Uses proper SDK methods to extract contract invocation parameters
   */
  parseTransactionXDR(xdr: string): {
    sessionId: number;
    player1: string;
    player2: string;
    player1Wager: bigint;
    player2Wager: bigint;
    transactionSource: string;
    functionName: string;
  } {
    // Parse the XDR into a Transaction object
    const transaction = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);

    // Get the transaction source (only regular Transactions have .source, not FeeBumpTransactions)
    const transactionSource = 'source' in transaction ? transaction.source : '';

    // Get the first operation (should be invokeHostFunction for contract calls)
    const operation = transaction.operations[0];

    if (!operation || operation.type !== 'invokeHostFunction') {
      throw new Error('Transaction does not contain a contract invocation');
    }

    // Extract the contract invocation details
    const func = operation.func;
    const invokeContractArgs = func.invokeContract();

    // Get function name
    const functionName = invokeContractArgs.functionName().toString();

    // Get the arguments (ScVal array)
    const args = invokeContractArgs.args();

    // For start_game, the arguments are:
    // 0: session_id (u32)
    // 1: player1 (Address)
    // 2: player2 (Address)
    // 3: player1_wager (i128)
    // 4: player2_wager (i128)

    if (functionName !== 'start_game') {
      throw new Error(`Unexpected function: ${functionName}. Expected start_game.`);
    }

    if (args.length !== 5) {
      throw new Error(`Expected 5 arguments for start_game, got ${args.length}`);
    }

    // Extract session_id (u32)
    const sessionId = args[0].u32();

    // Extract player1 (Address)
    const player1ScVal = args[1];
    const player1Address = player1ScVal.address().accountId().ed25519();
    const player1 = StrKey.encodeEd25519PublicKey(player1Address);

    // Extract player2 (Address)
    const player2ScVal = args[2];
    const player2Address = player2ScVal.address().accountId().ed25519();
    const player2 = StrKey.encodeEd25519PublicKey(player2Address);

    // Extract wagers (i128)
    const player1WagerScVal = args[3];
    const player1Wager = player1WagerScVal.i128().lo().toBigInt();

    const player2WagerScVal = args[4];
    const player2Wager = player2WagerScVal.i128().lo().toBigInt();

    return {
      sessionId,
      player1,
      player2,
      player1Wager,
      player2Wager,
      transactionSource,
      functionName,
    };
  }

  /**
   * Make a guess (1-10)
   */
  async makeGuess(
    sessionId: number,
    playerAddress: string,
    guess: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    if (guess < 1 || guess > 10) {
      throw new Error('Guess must be between 1 and 10');
    }

    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.make_guess({
      session_id: sessionId,
      player: playerAddress,
      guess,
    }, DEFAULT_METHOD_OPTIONS);

    // Simulate to ensure proper footprint
    await tx.simulate();

    try {
      const sentTx = await tx.signAndSend();

      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      return sentTx.result;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Transaction failed - check if the game is still active and you haven\'t already guessed');
      }
      throw err;
    }
  }

  /**
   * Reveal the winner after both players have guessed
   */
  async revealWinner(
    sessionId: number,
    callerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(callerAddress, signer);
    const tx = await client.reveal_winner({ session_id: sessionId }, DEFAULT_METHOD_OPTIONS);

    // CRITICAL: Simulate explicitly to ensure footprint includes all storage keys
    // The reveal_winner function calls blendizzard.end_game() which accesses EpochPlayer data
    await tx.simulate();

    try {
      const sentTx = await tx.signAndSend();

      // Check transaction status before accessing result
      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        // Extract error from diagnostic events instead of return_value
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      return sentTx.result;
    } catch (err) {
      // If we get here, either:
      // 1. The transaction failed and we couldn't parse the result (return_value is null)
      // 2. The transaction submission failed
      // 3. The transaction is still pending after timeout

      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        // This is the SDK error when trying to access .result on a failed transaction
        throw new Error('Transaction failed - check if both players have guessed and the game is still active');
      }

      throw err;
    }
  }

  /**
   * Extract human-readable error message from diagnostic events
   */
  private extractErrorFromDiagnostics(transactionResponse: any): string {
    try {
      // Log full response for debugging
      console.error('Transaction response:', JSON.stringify(transactionResponse, null, 2));

      const diagnosticEvents = transactionResponse?.diagnosticEventsXdr ||
                              transactionResponse?.diagnostic_events || [];

      // Look for error events in diagnostic events
      for (const event of diagnosticEvents) {
        if (event?.topics) {
          const topics = Array.isArray(event.topics) ? event.topics : [];

          // Check if this is an error event
          const hasErrorTopic = topics.some((topic: any) =>
            topic?.symbol === 'error' ||
            topic?.error
          );

          if (hasErrorTopic && event.data) {
            // Try to extract error message from data
            if (typeof event.data === 'string') {
              return event.data;
            } else if (event.data.vec && Array.isArray(event.data.vec)) {
              // Find string messages in the vec
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

      // Check for result_xdr error info
      if (transactionResponse?.result_xdr) {
        console.error('Result XDR:', transactionResponse.result_xdr);
      }

      // Check for error in return value
      if (transactionResponse?.returnValue) {
        console.error('Return value:', transactionResponse.returnValue);
      }

      // Fallback: return status with more context
      const status = transactionResponse?.status || 'Unknown';
      return `Transaction ${status}. Check console for details.`;
    } catch (err) {
      console.error('Failed to extract error from diagnostics:', err);
      return 'Transaction failed with unknown error';
    }
  }
}

// Export singleton instance
export const numberGuessService = new NumberGuessService();
