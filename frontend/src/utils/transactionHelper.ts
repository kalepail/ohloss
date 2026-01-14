import { rpc, contract, TransactionBuilder, Transaction } from '@stellar/stellar-sdk';
import { relayerService } from '@/services/relayerService';
import { useTurnstileStore } from '@/store/turnstileSlice';
import { NETWORK_PASSPHRASE, RPC_URL } from './constants';

/**
 * AssembledTransaction type from stellar-sdk
 * This represents a transaction that's been built and can be signed
 */
type AssembledTransaction = contract.AssembledTransaction<unknown>;

/**
 * Result of signing and sending a transaction
 * Matches the return type of tx.signAndSend()
 */
interface SignAndSendResult {
  result: unknown;
  getTransactionResponse?: rpc.Api.GetTransactionResponse;
}

/**
 * Sign a transaction and submit it via Relayer (replacing signAndSend)
 *
 * This function:
 * 1. Simulates the transaction if not already simulated
 * 2. Signs the transaction using the wallet
 * 3. Gets the Turnstile token from the store (if available)
 * 4. Submits the signed transaction via Relayer
 * 5. Waits for network confirmation
 * 6. Returns the result in the same format as signAndSend()
 *
 * @param tx - The assembled transaction to sign and send
 * @param timeoutSeconds - Maximum time to wait for confirmation (default: 30s)
 * @param validUntilLedgerSeq - Optional ledger sequence until which auth signatures are valid
 * @returns Result object matching signAndSend() format
 */
export async function signAndSendViaRelayer(
  tx: AssembledTransaction,
  timeoutSeconds = 30,
  validUntilLedgerSeq?: number
): Promise<SignAndSendResult> {
  // 1. Ensure transaction is simulated (this builds it)
  if (!tx.built) {
    await tx.simulate();
  }

  // 2. Check if we need to sign auth entries (non-invoker signatures)
  const needsAuthSigning = await tx.needsNonInvokerSigningBy();
  console.log('[signAndSendViaRelayer] Addresses that need to sign auth entries:', needsAuthSigning);

  // 3. Sign auth entries if needed
  const userAddress = tx.options.publicKey || tx.options.address;
  if (needsAuthSigning.length > 0 && userAddress && needsAuthSigning.includes(userAddress)) {
    console.log('[signAndSendViaRelayer] Signing auth entries for user:', userAddress);
    if (validUntilLedgerSeq) {
      console.log('[signAndSendViaRelayer] Using expiration ledger:', validUntilLedgerSeq);
      await tx.signAuthEntries({ expiration: validUntilLedgerSeq });
    } else {
      await tx.signAuthEntries();
    }
  }

  // 4. CRITICAL FIX: Rebuild transaction with correct fee
  // Relayer requires: tx.fee === resourceFee (with small tolerance of 201 stroops)
  if (!tx.built) {
    throw new Error('Transaction must be built before signing');
  }

  const resourceFee = tx.simulationData.transactionData.resourceFee().toString();

  // Rebuild with correct fee (matching pattern from AssembledTransaction.sign())
  const correctedTx = TransactionBuilder.cloneFrom(new Transaction(tx.built.toXDR(), NETWORK_PASSPHRASE), {
    fee: resourceFee,
    sorobanData: tx.simulationData.transactionData,
  }).build();

  console.log('[signAndSendViaRelayer] Transaction source:', correctedTx.source);
  console.log('[signAndSendViaRelayer] User address:', userAddress);

  // 5. Determine if we need to sign the transaction envelope
  // When using Relayer, we need to check if the transaction requires user signatures

  const isTransactionSource = correctedTx.source === userAddress;
  console.log('[signAndSendViaRelayer] Is transaction source:', isTransactionSource);

  // Check if there are any Soroban auth entries in the simulation
  // These indicate contract invocations that require authorization
  const hasSorobanAuth = tx.simulationData?.result?.auth && tx.simulationData.result.auth.length > 0;
  console.log('[signAndSendViaRelayer] Has soroban auth entries:', hasSorobanAuth);

  let signedXdr: string;

  // Decision logic for when to sign:
  // 1. If user is transaction source AND there are Soroban auths → SIGN
  //    (source_account credentials are needed even if needsNonInvokerSigningBy is empty)
  // 2. If there are non-invoker auths that need signing → SIGN
  // 3. Otherwise → DON'T SIGN (let Relayer handle it)
  //
  // This handles:
  // - start_game: Player 2 (source) signs even though needsNonInvokerSigningBy returns []
  // - make_guess: Player signs their auth entry
  // - reveal_winner: No signing if caller is not source AND no explicit auths
  const needsEnvelopeSignature = (isTransactionSource && hasSorobanAuth) || needsAuthSigning.length > 0;

  if (!needsEnvelopeSignature) {
    // No signing needed - Relayer will sign everything
    console.log('[signAndSendViaRelayer] No envelope signature needed, using unsigned transaction');
    signedXdr = correctedTx.toXDR();
  } else {
    // Sign the transaction envelope
    console.log('[signAndSendViaRelayer] Signing transaction envelope (source auth or non-invoker auths present)');

    if (!tx.options.signTransaction) {
      throw new Error('signTransaction function not available in transaction options');
    }

    const signOpts: any = {
      networkPassphrase: tx.options.networkPassphrase,
      address: userAddress,
    };

    const { signedTxXdr, error } = await tx.options.signTransaction(
      correctedTx.toXDR(),
      signOpts
    );

    if (error) {
      throw new Error(`Transaction signing failed: ${error.message}`);
    }

    signedXdr = signedTxXdr;
  }

  // 6. Get Turnstile token from store
  const turnstileToken = useTurnstileStore.getState().token || undefined;

  // 7. Create RPC client for polling
  const rpcServer = new rpc.Server(RPC_URL);

  try {
    // 8. Submit via Relayer and wait for confirmation
    const getTransactionResponse = await relayerService.submitAndWait(
      signedXdr,
      turnstileToken,
      rpcServer,
      timeoutSeconds
    );

    // 9. Check if transaction was successful
    if (getTransactionResponse.status === 'FAILED') {
      throw new Error(
        `Transaction failed: ${JSON.stringify(getTransactionResponse, null, 2)}`
      );
    }

    // 10. Get the result from the transaction response
    // For successful transactions, we need to extract the return value from the response
    let result: unknown;

    if (getTransactionResponse.status === 'SUCCESS' && getTransactionResponse.returnValue) {
      // Parse the actual return value from the executed transaction
      result = getTransactionResponse.returnValue;
    } else if (tx.simulation && rpc.Api.isSimulationSuccess(tx.simulation)) {
      // Fallback to simulation result if transaction doesn't have a return value
      result = tx.simulation.result?.retval;
    } else {
      result = undefined;
    }

    return {
      result,
      getTransactionResponse,
    };
  } catch (error) {
    console.error('Transaction submission via Relayer failed:', error);
    throw error;
  }
}

/**
 * Check if Relayer is available and configured
 */
export function isRelayerConfigured(): boolean {
  return relayerService.isConfigured();
}

/**
 * Get the current Turnstile token from the store
 */
export function getTurnstileToken(): string | null {
  return useTurnstileStore.getState().token;
}
