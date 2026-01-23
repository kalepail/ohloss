/**
 * Number Guess Service - Contract interactions via wallet bridge
 *
 * Adapts the original frontend's contract service to use cross-window
 * communication with the Ohloss wallet instead of direct signing.
 */

import { Client as NumberGuessClient } from 'number-guess'
import { xdr, Address, rpc, scValToNative } from '@stellar/stellar-sdk'
import { walletBridge } from './walletBridge'
import type { GameState } from '@/types/game'

// Configuration from environment
const GAME_CONTRACT = import.meta.env.VITE_NUMBER_GUESS_CONTRACT || ''
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Public Global Stellar Network ; September 2015'
const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.lightsail.network'

// Shared RPC client (for lightweight queries like latest ledger)
const rpcServer = new rpc.Server(RPC_URL)

// =============================================================================
// Storage key helpers (for direct ledger reads)
// =============================================================================

/**
 * Build the DataKey::Game(session_id) storage key
 * Matches Rust: DataKey::Game(u32) as a Vec with Symbol + u32
 */
function buildGameKey(sessionId: number): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Game'),
    xdr.ScVal.scvU32(sessionId),
  ])
}

/**
 * Convert storage key to ledger key for temporary storage
 */
function storageKeyToLedgerKey(
  contractId: string,
  key: xdr.ScVal
): xdr.LedgerKey {
  const contractAddress = new Address(contractId)
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key,
      durability: xdr.ContractDataDurability.temporary(),
    })
  )
}

export async function getLatestLedgerSequence(): Promise<number | null> {
  try {
    const latest = await rpcServer.getLatestLedger()
    return latest.sequence
  } catch (err) {
    console.warn('[getLatestLedgerSequence] Failed:', err)
    return null
  }
}

// Placeholder G address for transaction building
// Smart wallets use C addresses but SDK requires G address for publicKey
// The actual transaction source is handled by Relayer (fee sponsor)
const PLACEHOLDER_SOURCE = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB'

// Default options for contract method calls
const DEFAULT_METHOD_OPTIONS = {
  timeoutInSeconds: 30,
  fee: '100',
}

/**
 * Get game state - read-only via direct ledger entry read (single RPC call)
 * 
 * NOTE: We avoid simulate() which triggers multiple RPC requests.
 * Instead, we directly read the contract storage entry.
 */
export async function getGame(sessionId: number): Promise<GameState | null> {
  try {
    const gameKey = buildGameKey(sessionId)
    const ledgerKey = storageKeyToLedgerKey(GAME_CONTRACT, gameKey)

    const response = await rpcServer.getLedgerEntries(ledgerKey)

    if (!response.entries || response.entries.length === 0) {
      // Game doesn't exist yet
      return null
    }

    const entry = response.entries[0]
    const dataEntry = entry.val.contractData()
    const gameScVal = dataEntry.val()

    // Parse the Game struct from ScVal
    const game = scValToNative(gameScVal) as {
      player1: string
      player2: string
      player1_wager: bigint
      player2_wager: bigint
      player1_guess: number | null
      player2_guess: number | null
      winning_number: number | null
      winner: string | null
    }

    return {
      sessionId,
      player1: game.player1,
      player2: game.player2,
      player1Wager: game.player1_wager,
      player2Wager: game.player2_wager,
      player1Guess: game.player1_guess ?? null,
      player2Guess: game.player2_guess ?? null,
      winningNumber: game.winning_number ?? null,
      winner: game.winner ?? null,
    }
  } catch (err) {
    console.log('[getGame] Error:', err)
    return null
  }
}

/**
 * Get multiple games in a single RPC call (batched)
 * 
 * Returns a Map of sessionId -> GameState (or null if not found)
 * This is much more efficient than calling getGame() for each session.
 */
export async function getGamesBatched(sessionIds: number[]): Promise<Map<number, GameState | null>> {
  const result = new Map<number, GameState | null>()
  
  if (sessionIds.length === 0) {
    return result
  }

  try {
    // Build ledger keys for all sessions
    const ledgerKeys = sessionIds.map(sessionId => {
      const gameKey = buildGameKey(sessionId)
      return storageKeyToLedgerKey(GAME_CONTRACT, gameKey)
    })

    // Single RPC call for all games
    const response = await rpcServer.getLedgerEntries(...ledgerKeys)

    // Create a map of key -> entry for easier lookup
    const entriesByKey = new Map<string, typeof response.entries[0]>()
    for (const entry of response.entries || []) {
      const keyXdr = entry.key.toXDR('base64')
      entriesByKey.set(keyXdr, entry)
    }

    // Parse each game
    for (let i = 0; i < sessionIds.length; i++) {
      const sessionId = sessionIds[i]
      const expectedKeyXdr = ledgerKeys[i].toXDR('base64')
      const entry = entriesByKey.get(expectedKeyXdr)

      if (!entry) {
        result.set(sessionId, null)
        continue
      }

      try {
        const dataEntry = entry.val.contractData()
        const gameScVal = dataEntry.val()

        const game = scValToNative(gameScVal) as {
          player1: string
          player2: string
          player1_wager: bigint
          player2_wager: bigint
          player1_guess: number | null
          player2_guess: number | null
          winning_number: number | null
          winner: string | null
        }

        result.set(sessionId, {
          sessionId,
          player1: game.player1,
          player2: game.player2,
          player1Wager: game.player1_wager,
          player2Wager: game.player2_wager,
          player1Guess: game.player1_guess ?? null,
          player2Guess: game.player2_guess ?? null,
          winningNumber: game.winning_number ?? null,
          winner: game.winner ?? null,
        })
      } catch {
        result.set(sessionId, null)
      }
    }
  } catch (err) {
    console.log('[getGamesBatched] Error:', err)
    // Return all nulls on error
    for (const sessionId of sessionIds) {
      result.set(sessionId, null)
    }
  }

  return result
}

/**
 * Parse auth entry XDR to extract game parameters
 */
export function parseAuthEntry(authEntryXdr: string): {
  sessionId: number
  player1: string
  player1Wager: bigint
  functionName: string
} {
  try {
    const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64')

    // Extract Player 1's address from credentials
    const credentials = authEntry.credentials()
    const addressCreds = credentials.address()
    const player1Address = addressCreds.address()
    const player1 = Address.fromScAddress(player1Address).toString()

    // Get the root invocation
    const rootInvocation = authEntry.rootInvocation()
    const authorizedFunction = rootInvocation.function()
    const contractFn = authorizedFunction.contractFn()

    // Get function name and args
    const functionName = contractFn.functionName().toString()

    if (functionName !== 'start_game') {
      throw new Error(`Unexpected function: ${functionName}. Expected start_game.`)
    }

    // Extract arguments
    const args = contractFn.args()
    if (args.length !== 2) {
      throw new Error(`Expected 2 arguments, got ${args.length}`)
    }

    const sessionId = args[0].u32()
    const player1Wager = args[1].i128().lo().toBigInt()

    return {
      sessionId,
      player1,
      player1Wager,
      functionName,
    }
  } catch (err) {
    console.error('[parseAuthEntry] Error:', err)
    throw new Error(`Failed to parse auth entry: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

/**
 * Extract the signature expiration ledger from a signed auth entry XDR.
 * Returns null if not present or parsing fails.
 */
export function getAuthEntryExpirationLedger(authEntryXdr: string): number | null {
  try {
    const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64')
    const creds = authEntry.credentials()
    if (creds.switch().name !== 'sorobanCredentialsAddress') return null
    const addressCreds = creds.address()
    // signatureExpirationLedger() is a getter/setter in stellar-sdk XDR bindings.
    // Typings vary across stellar-sdk versions, so coerce defensively.
    const exp = addressCreds.signatureExpirationLedger() as unknown
    const n = Number(exp)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * STEP 1 (Player 1): Prepare game start and get signed auth entry
 *
 * This creates the transaction, sends to wallet for auth entry signing,
 * and returns the signed auth entry XDR for sharing with Player 2.
 *
 * NOTE: Uses player1's address as a temporary placeholder for player2 during
 * simulation (to pass faction validation). The actual player2 address will be
 * set when they join and rebuild the transaction. Player 1's auth entry only
 * contains their own session_id and wager, not player2's info.
 */
export async function prepareStartGame(
  sessionId: number,
  player1: string,
  player1Wager: bigint
): Promise<{ authEntryXdr: string } | { error: string }> {
  // Pre-open wallet popup synchronously (avoid popup blockers).
  // This function is typically called directly from a click handler; calling
  // window.open() before the first await preserves the user gesture.
  const preopen = walletBridge.preopen()
  if ('error' in preopen) return { error: preopen.error }

  try {
    // Build transaction with placeholder G address as source
    // (The actual source is handled by Relayer fee sponsor)
    //
    // IMPORTANT:
    // - We use player1's address as a temporary placeholder for player2 during simulation
    //   so faction validation passes.
    // - If player2 == player1 and we simulate with the full wager for both sides,
    //   Ohloss will attempt to deduct FP twice from the same account and simulation
    //   can fail with InsufficientFactionPoints.
    // - To avoid this, we set the placeholder player2 wager to the smallest valid amount (1).
    //
    // Player 2 will rebuild with their actual address + wager when they join.
    const buildClient = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLACEHOLDER_SOURCE,
    })

    const PLACEHOLDER_PLAYER2_WAGER = 1n

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2: player1, // placeholder - will be replaced when P2 joins
      player1_wager: player1Wager,
      player2_wager: PLACEHOLDER_PLAYER2_WAGER,
    }, DEFAULT_METHOD_OPTIONS)

    // Get auth entries from simulation
    if (!tx.simulationData?.result?.auth) {
      throw new Error('No auth entries found in simulation')
    }

    const authEntries = tx.simulationData.result.auth

    // Find Player 1's auth entry.
    // Because player2 is temporarily set to player1 during simulation, there may be TWO
    // auth entries for the same address (one for player1_wager, one for placeholder wager).
    // We must select the one that matches player1Wager.
    let player1AuthEntryXdr: string | null = null

    for (const entry of authEntries) {
      try {
        const entryAddress = entry.credentials().address().address()
        const entryAddressString = Address.fromScAddress(entryAddress).toString()

        if (entryAddressString !== player1) continue

        const fn = entry.rootInvocation().function().contractFn()
        const args = fn.args()
        if (args.length !== 2) continue

        const entrySessionId = args[0].u32()
        if (entrySessionId !== sessionId) continue

        // i128 in XDR can be larger than 64 bits; our wagers fit in u64 range,
        // so reading the low part is sufficient here.
        const entryWager = args[1].i128().lo().toBigInt()
        if (entryWager !== player1Wager) continue

        // Found it - send to wallet for signing
        const unsignedXdr = entry.toXDR('base64')

        const result = await walletBridge.signAuthEntry(
          unsignedXdr,
          `Sign to start game #${sessionId} with wager of ${Number(player1Wager) / 10_000_000} FP`
        )

        if ('error' in result) {
          return { error: result.error }
        }

        player1AuthEntryXdr = result.signedAuthEntryXdr
        break
      } catch {
        continue
      }
    }

    if (!player1AuthEntryXdr) {
      return { error: 'Could not find auth entry for your address' }
    }

    return { authEntryXdr: player1AuthEntryXdr }
  } catch (err) {
    console.error('[prepareStartGame] Error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to prepare game'
    // Popup may have been pre-opened already; surface the error there too.
    walletBridge.notifyUiError(msg)
    return { error: msg }
  }
}

/**
 * STEP 2 (Player 2): Join game with Player 1's signed auth entry
 *
 * Imports Player 1's auth entry, creates full transaction,
 * signs Player 2's auth entry, and submits.
 */
export async function joinGame(
  sessionId: number,
  player1AuthXdr: string,
  player2: string,
  player2Wager: bigint
): Promise<{ success: boolean; txHash?: string } | { error: string }> {
  // Pre-open wallet popup synchronously (avoid popup blockers).
  const preopen = walletBridge.preopen()
  if ('error' in preopen) return { error: preopen.error }

  try {
    // Parse Player 1's auth entry to get their info
    const p1Info = parseAuthEntry(player1AuthXdr)

    if (p1Info.sessionId !== sessionId) {
      return { error: 'Session ID mismatch in auth entry' }
    }

    if (p1Info.player1 === player2) {
      return { error: 'Cannot play against yourself' }
    }

    // Build transaction with placeholder G address as source
    // (Fee sponsor / Relayer will be the actual transaction source)
    const buildClient = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLACEHOLDER_SOURCE,
    })

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1: p1Info.player1,
      player2,
      player1_wager: p1Info.player1Wager,
      player2_wager: player2Wager,
    }, DEFAULT_METHOD_OPTIONS)

    // Inject Player 1's signed auth entry
    if (tx.simulationData?.result?.auth) {
      const authEntries = tx.simulationData.result.auth
      const player1SignedEntry = xdr.SorobanAuthorizationEntry.fromXDR(player1AuthXdr, 'base64')

      // Find and replace Player 1's stubbed entry
      for (let i = 0; i < authEntries.length; i++) {
        try {
          const entryAddress = authEntries[i].credentials().address().address()
          const entryAddressString = Address.fromScAddress(entryAddress).toString()

          if (entryAddressString === p1Info.player1) {
            // Replace with signed entry
            authEntries[i] = player1SignedEntry
            break
          }
        } catch {
          continue
        }
      }
    }

    // Export transaction XDR for signing via wallet popup
    const txXdr = tx.toXDR()

    // Send to wallet for signing and submission
    const result = await walletBridge.signTransaction(
      txXdr,
      `Join game #${sessionId} and wager ${Number(player2Wager) / 10_000_000} FP`,
      true // Submit after signing
    )

    if ('error' in result) {
      return { error: result.error }
    }

    return {
      success: true,
      txHash: result.txHash,
    }
  } catch (err) {
    console.error('[joinGame] Error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to join game'
    walletBridge.notifyUiError(msg)
    return { error: msg }
  }
}

/**
 * Make a guess (1-10)
 */
export async function makeGuess(
  sessionId: number,
  playerAddress: string,
  guess: number
): Promise<{ success: boolean; txHash?: string } | { error: string }> {
  if (guess < 1 || guess > 10) {
    return { error: 'Guess must be between 1 and 10' }
  }

  // Pre-open wallet popup synchronously (avoid popup blockers).
  const preopen = walletBridge.preopen()
  if ('error' in preopen) return { error: preopen.error }

  try {
    // Use placeholder G address for building (Relayer handles actual source)
    const client = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLACEHOLDER_SOURCE,
    })

    const tx = await client.make_guess({
      session_id: sessionId,
      player: playerAddress,
      guess,
    }, DEFAULT_METHOD_OPTIONS)

    const txXdr = tx.toXDR()

    // Send to wallet for signing and submission
    const result = await walletBridge.signTransaction(
      txXdr,
      `Lock in guess: ${guess}`,
      true
    )

    if ('error' in result) {
      return { error: result.error }
    }

    return {
      success: true,
      txHash: result.txHash,
    }
  } catch (err) {
    console.error('[makeGuess] Error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to submit guess'
    walletBridge.notifyUiError(msg)
    return { error: msg }
  }
}

/**
 * Reveal winner
 */
export async function revealWinner(
  sessionId: number
): Promise<{ success: boolean; txHash?: string; winner?: string } | { error: string }> {
  // Pre-open wallet popup synchronously (avoid popup blockers).
  const preopen = walletBridge.preopen()
  if ('error' in preopen) return { error: preopen.error }

  try {
    // Get the game first to find a valid player address to use as source
    const game = await getGame(sessionId)
    if (!game) {
      return { error: 'Game not found' }
    }

    if (game.player1Guess === null || game.player2Guess === null) {
      return { error: 'Both players must guess before revealing' }
    }

    // Use placeholder G address for building (Relayer handles actual source)
    const client = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLACEHOLDER_SOURCE,
    })

    const tx = await client.reveal_winner({ session_id: sessionId }, DEFAULT_METHOD_OPTIONS)
    const txXdr = tx.toXDR()

    // Send to wallet for signing and submission
    const result = await walletBridge.signTransaction(
      txXdr,
      'Reveal the winner!',
      true
    )

    if ('error' in result) {
      return { error: result.error }
    }

    return {
      success: true,
      txHash: result.txHash,
    }
  } catch (err) {
    console.error('[revealWinner] Error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to reveal winner'
    walletBridge.notifyUiError(msg)
    return { error: msg }
  }
}
