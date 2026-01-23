// Smart Account Kit integration
// Uses OpenZeppelin's smart-account-kit for WebAuthn passkey-based Stellar smart wallets

import { SmartAccountKit, IndexedDBStorage } from 'smart-account-kit'
import { sendXdr as relayerSendXdr, send as relayerSend } from './relayerService'
import type { contract } from '@stellar/stellar-sdk'

// Configuration from environment
const CONFIG = {
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  accountWasmHash: import.meta.env.VITE_ACCOUNT_WASM_HASH || '',
  webauthnVerifierAddress: import.meta.env.VITE_WEBAUTHN_VERIFIER_ADDRESS || '',
  nativeTokenContract: import.meta.env.VITE_NATIVE_TOKEN_CONTRACT || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  relayerUrl: import.meta.env.VITE_RELAYER_URL || '',
  indexerUrl: import.meta.env.VITE_SMART_ACCOUNT_INDEXER_URL || '',
}

// Singleton kit instance
let kitInstance: SmartAccountKit | null = null

/**
 * Get or create the SmartAccountKit singleton instance
 */
export function getKit(): SmartAccountKit {
  if (!kitInstance) {
    if (!CONFIG.accountWasmHash || !CONFIG.webauthnVerifierAddress) {
      throw new Error(
        'Smart Account Kit not configured. Set VITE_ACCOUNT_WASM_HASH and VITE_WEBAUTHN_VERIFIER_ADDRESS environment variables.'
      )
    }

    kitInstance = new SmartAccountKit({
      rpcUrl: CONFIG.rpcUrl,
      networkPassphrase: CONFIG.networkPassphrase,
      accountWasmHash: CONFIG.accountWasmHash,
      webauthnVerifierAddress: CONFIG.webauthnVerifierAddress,
      storage: new IndexedDBStorage(),
      rpName: 'Ohloss',
      // Indexer for reverse lookups (credential -> contracts)
      ...(CONFIG.indexerUrl && { indexerUrl: CONFIG.indexerUrl }),
      // Note: Relayer for kit operations (signAndSubmit, transfer, etc.)
      // Uses API key auth. For Turnstile-based auth, use relayerService.ts directly.
      ...(CONFIG.relayerUrl && { relayerUrl: CONFIG.relayerUrl }),
    })
  }

  return kitInstance
}

/**
 * Check if the SDK is properly configured
 */
export function isConfigured(): boolean {
  return !!(CONFIG.accountWasmHash && CONFIG.webauthnVerifierAddress)
}

/**
 * Create a new smart wallet with a passkey
 * This registers a WebAuthn credential and deploys a smart account contract
 *
 * Note: We use autoSubmit: false and manually submit via relayerService
 * to include the Turnstile header for production bot protection.
 */
export async function createWallet(userName?: string): Promise<{
  contractId: string
  credentialId: string
}> {
  const kit = getKit()

  // Don't use autoSubmit - we need to submit via relayerService for Turnstile support
  const result = await kit.createWallet('Ohloss', userName || 'Player', {
    autoSubmit: false,
  })

  // Manually submit the signed transaction via relayerService (includes Turnstile header)
  // relayerService handles both dev (API key) and prod (Turnstile) modes
  const submitResult = await relayerSendXdr(result.signedTransaction)
  if (!submitResult.success) {
    throw new Error(submitResult.error || 'Wallet deployment failed')
  }

  return {
    contractId: result.contractId,
    credentialId: result.credentialId,
  }
}

/**
 * Connect to an existing wallet
 * First tries silent restore from stored session, then prompts for passkey if needed.
 * If the stored session points to a contract that doesn't exist, clears it and prompts fresh.
 */
export async function connectWallet(options?: {
  prompt?: boolean
  credentialId?: string
  contractId?: string
}): Promise<{
  contractId: string
  credentialId: string
} | null> {
  const kit = getKit()

  // Try silent restore first (unless prompt explicitly requested)
  if (!options?.prompt) {
    try {
      const result = await kit.connectWallet()
      if (result) {
        return {
          contractId: result.contractId,
          credentialId: result.credentialId,
        }
      }
    } catch (err) {
      // If silent restore failed due to contract not found, clear session
      // This can happen if the session was from a different network
      if (err instanceof Error && err.message.includes('not found on-chain')) {
        console.warn('Stored session invalid, clearing:', err.message)
        await kit.disconnect()
      } else {
        throw err
      }
    }
  }

  // If prompt requested or no stored session, prompt for passkey
  if (options?.prompt || options?.credentialId || options?.contractId) {
    try {
      const result = await kit.connectWallet({
        prompt: options?.prompt,
        credentialId: options?.credentialId,
        contractId: options?.contractId,
      })

      if (result) {
        return {
          contractId: result.contractId,
          credentialId: result.credentialId,
        }
      }
    } catch (err) {
      // If the derived contract doesn't exist, clear invalid session and re-throw with helpful message
      if (err instanceof Error && err.message.includes('not found on-chain')) {
        console.warn('Contract not found, clearing session:', err.message)
        await kit.disconnect()

        // Re-throw with a clearer error message
        throw new Error(
          `No smart account found for this passkey on this network. ` +
          `This passkey may have been created on a different network (testnet vs mainnet), ` +
          `or the contract deployment failed. Please try a different passkey or create a new wallet.`
        )
      }
      throw err
    }
  }

  return null
}

/**
 * Authenticate with passkey and discover contracts via indexer
 * Use this when the user might have multiple smart accounts
 */
export async function authenticateAndDiscover(): Promise<{
  credentialId: string
  contracts: Array<{ contract_id: string; context_rule_count: number }>
}> {
  const kit = getKit()

  // Authenticate to get credential ID
  const { credentialId } = await kit.authenticatePasskey()

  // Discover contracts via indexer
  const contracts = await kit.discoverContractsByCredential(credentialId)

  return {
    credentialId,
    contracts: contracts || [],
  }
}

/**
 * Disconnect from the current wallet and clear session
 */
export async function disconnect(): Promise<void> {
  const kit = getKit()
  await kit.disconnect()
}

/**
 * Check if there's a stored session (for auto-reconnect)
 */
export async function hasStoredSession(): Promise<boolean> {
  try {
    const kit = getKit()
    const result = await kit.connectWallet() // Silent restore attempt
    if (result) {
      await kit.disconnect() // Don't actually connect, just checking
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Get pending credentials that haven't been deployed yet
 */
export async function getPendingCredentials() {
  const kit = getKit()
  return kit.credentials.getPending()
}

/**
 * Deploy a pending credential
 *
 * Note: We use autoSubmit: false and manually submit via relayerService
 * to include the Turnstile header for production bot protection.
 */
export async function deployPendingCredential(credentialId: string): Promise<{
  contractId: string
  success: boolean
  error?: string
}> {
  const kit = getKit()

  // Don't use autoSubmit - we need to submit via relayerService for Turnstile support
  const result = await kit.credentials.deploy(credentialId, {
    autoSubmit: false,
  })

  // Manually submit the signed transaction via relayerService (includes Turnstile header)
  // relayerService handles both dev (API key) and prod (Turnstile) modes
  const submitResult = await relayerSendXdr(result.signedTransaction)
  return {
    contractId: result.contractId,
    success: submitResult.success,
    error: submitResult.error,
  }
}

/**
 * Delete a pending credential
 */
export async function deletePendingCredential(credentialId: string): Promise<void> {
  const kit = getKit()
  await kit.credentials.delete(credentialId)
}

/**
 * Clear all stored credentials and session
 * Use this to reset when in a bad state
 */
export async function clearAllCredentials(): Promise<void> {
  const kit = getKit()
  const allCreds = await kit.credentials.getAll()
  for (const cred of allCreds) {
    try {
      await kit.credentials.delete(cred.credentialId)
    } catch (e) {
      console.warn('Failed to delete credential:', cred.credentialId, e)
    }
  }
  await kit.disconnect()
}

/**
 * Get the current contract ID if connected
 */
export function getContractId(): string | null {
  if (!kitInstance) return null
  // The kit stores the current contract ID internally after connect
  // We'd need to track this separately or expose it from the kit
  return null
}

// Export configuration for external use
export const config = {
  ...CONFIG,
  isConfigured: isConfigured(),
}

/**
 * Sign and submit a transaction using the kit for signing but relayerService for submission.
 * This bypasses the kit's internal relayer and uses our relayerService which includes
 * the Turnstile header for production bot protection.
 *
 * Use this instead of kit.signAndSubmit() for all contract operations.
 */
export async function signAndSubmitWithTurnstile<T>(
  tx: contract.AssembledTransaction<T>
): Promise<{ success: boolean; hash?: string; error?: string }> {
  const kit = getKit()

  if (!kit.isConnected) {
    return { success: false, error: 'Wallet not connected' }
  }

  try {
    // Get the built transaction and simulation data
    const builtTx = tx.built
    if (!builtTx) {
      return { success: false, error: 'Transaction has no built transaction' }
    }

    const operations = builtTx.operations
    if (operations.length !== 1) {
      return { success: false, error: 'Expected exactly one operation' }
    }

    const operation = operations[0]
    if (operation.type !== 'invokeHostFunction') {
      return { success: false, error: 'Expected invokeHostFunction operation' }
    }

    // Get func from the operation
    const invokeOp = operation as { func: { toXDR: (format: string) => string }; auth?: Array<{ toXDR: (format: string) => string }> }
    const funcXdr = invokeOp.func.toXDR('base64')

    // Get auth entries from simulation data
    const simData = tx.simulationData
    if (!simData?.result?.auth) {
      return { success: false, error: 'No simulation data or auth entries' }
    }

    // Sign each auth entry with the passkey
    const signedAuthXdrs: string[] = []
    for (const authEntry of simData.result.auth) {
      const signedEntry = await kit.signAuthEntry(authEntry)
      signedAuthXdrs.push(signedEntry.toXDR('base64'))
    }

    // Submit via relayerService which includes Turnstile header
    // The relayer proxy handles simulation and transaction building server-side
    const result = await relayerSend(funcXdr, signedAuthXdrs)

    return {
      success: result.success,
      hash: result.hash,
      error: result.error,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during sign and submit',
    }
  }
}

// Export the kit getter for advanced usage
export { getKit as getSmartAccountKit }
