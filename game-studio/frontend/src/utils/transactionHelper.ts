/**
 * Transaction helper utilities
 */

import { contract } from '@stellar/stellar-sdk';

/**
 * Sign and send a transaction via Launchtube
 * @param tx - The assembled transaction or XDR string
 * @param timeoutInSeconds - Timeout for the transaction
 * @param validUntilLedgerSeq - Valid until ledger sequence
 * @returns Transaction result
 */
export async function signAndSendViaLaunchtube(
  tx: contract.AssembledTransaction<any> | string,
  timeoutInSeconds: number = 30,
  validUntilLedgerSeq?: number
): Promise<contract.SentTransaction<any>> {
  // If tx is an AssembledTransaction, simulate and send
  if (typeof tx !== 'string' && 'simulate' in tx) {
    const simulated = await tx.simulate();
    try {
      return await simulated.signAndSend();
    } catch (err: any) {
      const errName = err?.name ?? '';
      const errMessage = err instanceof Error ? err.message : String(err);
      const isNoSignatureNeeded =
        errName.includes('NoSignatureNeededError') || errMessage.includes('NoSignatureNeededError');

      // Some contract bindings incorrectly classify state-changing methods as "read calls".
      // In those cases, the SDK requires `force: true` to sign and send anyway.
      if (isNoSignatureNeeded) {
        return simulated.signAndSend({ force: true });
      }

      throw err;
    }
  }

  // If tx is XDR string, it needs to be sent directly
  // This is typically used for multi-sig flows where the transaction is already built
  throw new Error('Direct XDR submission not yet implemented. Use AssembledTransaction.signAndSend() instead.');
}
