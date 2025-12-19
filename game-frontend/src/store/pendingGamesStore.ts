/**
 * Pending Games Store - Persists signed games to localStorage
 *
 * Tracks games that have been signed by Player 1 but not yet started by Player 2,
 * allowing users to resume sharing or playing without re-signing.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PendingGameStatus =
  | 'waiting_for_player2' // P1 signed, waiting for P2 to join
  | 'ready_to_play' // Both signed, game started, guessing phase
  | 'waiting_for_guess' // Current player has guessed, waiting for opponent
  | 'ready_to_reveal' // Both guessed, ready to reveal winner
  | 'complete' // Game finished

export interface PendingGame {
  sessionId: number
  playerAddress: string // The player who created/joined this entry
  role: 'player1' | 'player2'
  authEntryXdr?: string // P1's signed auth entry (for sharing)
  // Ledger at which the auth entry signature expires (exclusive).
  // Used to warn if an invite is stale.
  authExpirationLedger?: number
  wager: string
  createdAt: number
  status: PendingGameStatus
  opponentAddress?: string
  // Completion info (populated when game ends)
  winner?: string // Address of winner (or undefined if tie/not complete)
  winningNumber?: number
  didWin?: boolean // True if this player won
  yourGuess?: number // This player's guess
  opponentGuess?: number // Opponent's guess
}

interface PendingGamesState {
  games: PendingGame[]

  // Actions
  addGame: (game: Omit<PendingGame, 'createdAt'>) => void
  updateGameStatus: (sessionId: number, playerAddress: string, status: PendingGameStatus) => void
  updateGame: (sessionId: number, playerAddress: string, updates: Partial<PendingGame>) => void
  removeGame: (sessionId: number, playerAddress: string) => void
  getGame: (sessionId: number, playerAddress: string) => PendingGame | undefined
  getGamesForPlayer: (playerAddress: string) => PendingGame[]
  clearOldGames: (maxAgeHours?: number) => void
}

export const usePendingGamesStore = create<PendingGamesState>()(
  persist(
    (set, get) => ({
      games: [],

      addGame: (game) => {
        set((state) => {
          // Remove any existing game with same sessionId for this player
          const filtered = state.games.filter(
            (g) => !(g.sessionId === game.sessionId && g.playerAddress === game.playerAddress)
          )
          return {
            games: [
              ...filtered,
              {
                ...game,
                createdAt: Date.now(),
              },
            ],
          }
        })
      },

      updateGameStatus: (sessionId, playerAddress, status) => {
        set((state) => ({
          games: state.games.map((g) =>
            g.sessionId === sessionId && g.playerAddress === playerAddress
              ? { ...g, status }
              : g
          ),
        }))
      },

      updateGame: (sessionId, playerAddress, updates) => {
        set((state) => ({
          games: state.games.map((g) =>
            g.sessionId === sessionId && g.playerAddress === playerAddress
              ? { ...g, ...updates }
              : g
          ),
        }))
      },

      removeGame: (sessionId, playerAddress) => {
        set((state) => ({
          games: state.games.filter(
            (g) => !(g.sessionId === sessionId && g.playerAddress === playerAddress)
          ),
        }))
      },

      getGame: (sessionId, playerAddress) => {
        return get().games.find(
          (g) => g.sessionId === sessionId && g.playerAddress === playerAddress
        )
      },

      getGamesForPlayer: (playerAddress) => {
        return get().games.filter((g) => g.playerAddress === playerAddress)
      },

      clearOldGames: (maxAgeHours = 48) => {
        const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000
        set((state) => ({
          games: state.games.filter((g) => g.createdAt > cutoff),
        }))
      },
    }),
    {
      name: 'ohloss-pending-games',
    }
  )
)
