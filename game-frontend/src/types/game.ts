/**
 * Game state types for the Number Guess game
 */

// Faction definitions
export const FACTIONS = {
  0: { name: 'Gilded Fin', emoji: '𓆛', color: 'text-amber-600', bg: 'bg-amber-100' },
  1: { name: 'Verdant Hollow', emoji: '𓆣', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  2: { name: 'Wobblestone', emoji: '𓅣', color: 'text-slate-600', bg: 'bg-slate-100' },
} as const

export type FactionId = keyof typeof FACTIONS

export function getFactionInfo(factionId: number | null): typeof FACTIONS[FactionId] | null {
  if (factionId === null || !(factionId in FACTIONS)) return null
  return FACTIONS[factionId as FactionId]
}

// Game phases
export type GamePhase =
  | 'connecting'      // Connecting to wallet
  | 'lobby'           // Choose create or join
  | 'loading_game'    // Loading game state from chain
  | 'awaiting_start'  // Session exists, but game not started on-chain yet
  | 'setup'           // Entering opponent address before creating
  | 'creating'        // Setting up a new game
  | 'waiting'         // Waiting for opponent to join
  | 'join_review'     // Viewing invite details + choosing wager before signing
  | 'joining'         // Joining / starting the game (signing + submission)
  | 'guessing'        // Making your guess
  | 'waiting_guess'   // Waiting for opponent's guess
  | 'revealing'       // Revealing the winner
  | 'complete'        // Game finished

// Player role in the game
export type PlayerRole = 'player1' | 'player2' | 'spectator'

// Game state from contract
export interface GameState {
  sessionId: number
  player1: string
  player2: string
  player1Wager: bigint
  player2Wager: bigint
  player1Guess: number | null
  player2Guess: number | null
  winningNumber: number | null
  winner: string | null
}

// Local game UI state
export interface GameUIState {
  phase: GamePhase
  role: PlayerRole | null
  selectedNumber: number | null
  isSubmitting: boolean
  error: string | null
}

// Create game form
export interface CreateGameForm {
  wager: string
  sessionId: number
}

// Join game form
export interface JoinGameForm {
  sessionId: string
  inviteXdr?: string // Auth entry XDR from invite link
  wager: string
}

// Invite link data
export interface InviteData {
  sessionId: number
  player1: string
  player1Wager: bigint
  authEntryXdr: string
}

// Parse invite from URL or pasted XDR
export function parseInvite(input: string): InviteData | null {
  try {
    // Check if it's a URL
    const url = new URL(input)
    const auth = url.searchParams.get('auth')
    if (auth) {
      return parseInviteXdr(auth)
    }
  } catch {
    // Not a URL, try parsing as XDR directly
  }

  return parseInviteXdr(input)
}

// Parse auth entry XDR to extract invite data
// This will be implemented once we have contract bindings
export function parseInviteXdr(xdr: string): InviteData | null {
  // TODO: Implement parsing logic using stellar-sdk
  // For now, return null - will be implemented in numberGuessService
  console.log('parseInviteXdr called with:', xdr.slice(0, 50) + '...')
  return null
}

// Format address for display
export function formatAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Format wager amount (7 decimals to human readable)
export function formatWager(amount: bigint): string {
  const value = Number(amount) / 10_000_000
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

// Parse human readable to contract amount
export function parseWager(input: string): bigint {
  const value = parseFloat(input)
  if (isNaN(value) || value < 0) return 0n
  return BigInt(Math.floor(value * 10_000_000))
}
