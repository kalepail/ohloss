import { xdr, Address, contract } from '@stellar/stellar-sdk';

type AssembledTransaction = contract.AssembledTransaction<unknown>;

/**
 * Extract signed authorization entry for a specific address from a built transaction
 *
 * After calling signAuthEntries(), the signed entries are stored in tx.simulationData.result.auth
 * (not in tx.built.operations[0].auth yet). This function extracts from the simulation data.
 *
 * @param tx - The assembled transaction with signed auth entries
 * @param signerAddress - The Stellar address whose auth entry to extract
 * @returns Base64-encoded XDR of the signed auth entry
 * @throws Error if no auth entry found for the address
 */
export function extractSignedAuthEntry(
  tx: AssembledTransaction,
  signerAddress: string
): string {
  // After signAuthEntries(), auth entries are in simulationData.result.auth
  if (!tx.simulationData?.result) {
    throw new Error('Transaction must be simulated before extracting auth entries');
  }

  const authEntries = tx.simulationData.result.auth || [];

  if (authEntries.length === 0) {
    throw new Error('No authorization entries found in simulation data');
  }

  console.log(`[extractSignedAuthEntry] Looking for auth entry for ${signerAddress}`);
  console.log(`[extractSignedAuthEntry] Found ${authEntries.length} auth entries in simulation data`);

  for (let i = 0; i < authEntries.length; i++) {
    const entry = authEntries[i];
    try {
      // Get the address from the auth entry credentials
      const entryAddress = entry.credentials().address().address();
      const entryAddressString = Address.fromScAddress(entryAddress).toString();

      console.log(`[extractSignedAuthEntry] Auth entry ${i} address: ${entryAddressString}`);

      // Compare address strings
      if (entryAddressString === signerAddress) {
        console.log(`[extractSignedAuthEntry] Found matching auth entry at index ${i}`);
        // Found the matching auth entry - serialize to XDR
        return entry.toXDR('base64');
      }
    } catch (err) {
      // This auth entry doesn't have address credentials, skip it
      console.log(`[extractSignedAuthEntry] Auth entry ${i} doesn't have address credentials:`, err);
      continue;
    }
  }

  throw new Error(`No authorization entry found for address ${signerAddress}`);
}

/**
 * Inject a signed authorization entry into a simulated transaction
 *
 * This replaces the stubbed (simulated) auth entry with the actual signed one
 * by matching on the signer's address.
 *
 * @param tx - The assembled transaction with simulated (stubbed) auth entries
 * @param signedAuthEntryXdr - Base64-encoded XDR of the signed auth entry to inject
 * @param signerAddress - The Stellar address whose auth entry is being injected
 * @returns Updated AssembledTransaction with the signed auth entry injected
 * @throws Error if no matching stubbed auth entry found
 */
export function injectSignedAuthEntry(
  tx: AssembledTransaction,
  signedAuthEntryXdr: string,
  signerAddress: string
): AssembledTransaction {
  if (!tx.built) {
    throw new Error('Transaction must be built before injecting auth entries');
  }

  // Parse the signed auth entry from XDR
  const signedAuthEntry = xdr.SorobanAuthorizationEntry.fromXDR(signedAuthEntryXdr, 'base64');

  // Get the first operation
  const operation = tx.built.operations[0];

  if (!operation || operation.type !== 'invokeHostFunction') {
    throw new Error('Transaction does not contain a contract invocation');
  }

  // Get existing auth entries from simulation data (not operation.auth)
  // After simulation, auth entries are in simulationData.result.auth
  if (!tx.simulationData?.result?.auth) {
    throw new Error('No simulation data or auth entries found in transaction');
  }

  const authEntries = tx.simulationData.result.auth;

  if (authEntries.length === 0) {
    throw new Error('No authorization entries found in simulation data');
  }

  // Find the index of the stubbed auth entry for this signer
  let matchIndex = -1;

  for (let i = 0; i < authEntries.length; i++) {
    try {
      const credentials = authEntries[i].credentials();
      const credType = credentials.switch().name;

      // Only check address credentials (skip source credentials)
      if (credType === 'sorobanCredentialsAddress') {
        const entryAddress = credentials.address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();

        console.log(`[injectSignedAuthEntry] Checking auth entry ${i}: ${entryAddressString}`);

        if (entryAddressString === signerAddress) {
          matchIndex = i;
          console.log(`[injectSignedAuthEntry] ✅ Found match at index ${i}`);
          break;
        }
      } else {
        console.log(`[injectSignedAuthEntry] Skipping auth entry ${i}: ${credType}`);
      }
    } catch (err: any) {
      console.log(`[injectSignedAuthEntry] Error reading auth entry ${i}:`, err.message);
      continue;
    }
  }

  if (matchIndex === -1) {
    throw new Error(`No stubbed authorization entry found for address ${signerAddress}`);
  }

  // DIRECTLY mutate the auth entry at the found index
  // This works because authEntries is a reference to the actual array in simulationData
  // We don't need to (and can't) reassign simulationData since it's a getter
  authEntries[matchIndex] = signedAuthEntry;

  console.log(`[injectSignedAuthEntry] ✅ Replaced stubbed auth entry at index ${matchIndex} for ${signerAddress}`);
  console.log('[injectSignedAuthEntry] Successfully injected signed auth entry (direct mutation)');

  return tx;
}

/**
 * Helper: Check how many auth entries are in a transaction
 */
export function getAuthEntryCount(tx: AssembledTransaction): number {
  if (!tx.built) {
    return 0;
  }

  const operation = tx.built.operations[0];

  if (!operation || operation.type !== 'invokeHostFunction') {
    return 0;
  }

  return operation.auth?.length || 0;
}

/**
 * Helper: Get all addresses that have auth entries in the transaction
 */
export function getAuthEntryAddresses(tx: AssembledTransaction): string[] {
  if (!tx.built) {
    return [];
  }

  const operation = tx.built.operations[0];

  if (!operation || operation.type !== 'invokeHostFunction') {
    return [];
  }

  const authEntries = operation.auth || [];
  const addresses: string[] = [];

  for (const entry of authEntries) {
    try {
      const entryAddress = entry.credentials().address().address();
      const stellarAddress = Address.fromScAddress(entryAddress).toString();
      addresses.push(stellarAddress);
    } catch (err) {
      // This auth entry doesn't have address credentials, skip it
      continue;
    }
  }

  return addresses;
}
