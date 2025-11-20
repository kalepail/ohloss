import { rpc, contract, TransactionBuilder } from '@stellar/stellar-sdk';
import { launchtubeService } from '@/services/launchtubeService';
import { useTurnstileStore } from '@/store/turnstileSlice';
import { RPC_URL } from './constants';

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
 * Sign a transaction and submit it via Launchtube (replacing signAndSend)
 *
 * This function:
 * 1. Simulates the transaction if not already simulated
 * 2. Signs the transaction using the wallet
 * 3. Gets the Turnstile token from the store (if available)
 * 4. Submits the signed transaction via Launchtube
 * 5. Waits for network confirmation
 * 6. Returns the result in the same format as signAndSend()
 *
 * @param tx - The assembled transaction to sign and send
 * @param timeoutSeconds - Maximum time to wait for confirmation (default: 30s)
 * @returns Result object matching signAndSend() format
 */
export async function signAndSendViaLaunchtube(
  tx: AssembledTransaction,
  timeoutSeconds = 30
): Promise<SignAndSendResult> {
  // 1. Ensure transaction is simulated (this builds it)
  if (!tx.built) {
    await tx.simulate();
  }

  // 2. CRITICAL FIX: Set transaction fee equal to resource fee before signing
  // Launchtube requires: tx.fee === resourceFee (with small tolerance of 201 stroops)
  // Reference: https://github.com/stellar/launchtube/blob/main/src/api/launch.ts#L232-235
  if (!tx.built) {
    throw new Error('Transaction must be built before setting fee. This should not happen after simulate().');
  }

  const resourceFee = tx.simulationData.transactionData.resourceFee().toString();

  // Rebuild the transaction with the fee set to exactly the resource fee
  tx.built = TransactionBuilder.cloneFrom(tx.built, {
    fee: resourceFee,
    sorobanData: tx.simulationData.transactionData,
  }).build();

  // 3. Sign the transaction
  await tx.sign();

  // 4. Get the signed XDR from the signed transaction
  if (!tx.signed) {
    throw new Error('Transaction not signed. The sign() method may have failed.');
  }
  const signedXdr = tx.signed.toXDR();

  // 4. Get Turnstile token from store
  const turnstileToken = useTurnstileStore.getState().token || undefined;

  // 5. Create RPC client for polling
  const rpcServer = new rpc.Server(RPC_URL);

  try {
    // 5. Submit via Launchtube and wait for confirmation
    const getTransactionResponse = await launchtubeService.submitAndWait(
      signedXdr,
      turnstileToken,
      rpcServer,
      timeoutSeconds
    );

    // 6. Check if transaction was successful
    if (getTransactionResponse.status === 'FAILED') {
      throw new Error(
        `Transaction failed: ${JSON.stringify(getTransactionResponse, null, 2)}`
      );
    }

    // 7. Get the result from the transaction response
    // This matches what signAndSend() would return
    const result = tx.simulation && rpc.Api.isSimulationSuccess(tx.simulation)
      ? tx.simulation.result?.retval
      : undefined;

    return {
      result,
      getTransactionResponse,
    };
  } catch (error) {
    console.error('Transaction submission via Launchtube failed:', error);
    throw error;
  }
}

/**
 * Check if Launchtube is available and configured
 * If not, fall back to direct RPC submission
 */
export function isLaunchtubeConfigured(): boolean {
  return launchtubeService.isConfigured();
}

/**
 * Get the current Turnstile token from the store
 */
export function getTurnstileToken(): string | null {
  return useTurnstileStore.getState().token;
}
