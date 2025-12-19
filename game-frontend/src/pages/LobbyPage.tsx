import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/gameStore'
import { useWalletStore } from '@/store/walletStore'
import { useAvailableFp } from '@/hooks/useAvailableFp'
import { formatWager } from '@/types/game'
import { hasFactionSelected } from '@/services/ohlossService'

type Mode = 'menu' | 'create' | 'join'

export default function LobbyPage() {
  const [mode, setMode] = useState<Mode>('menu')
  const { wagerInput, setWagerInput, setError, error } = useGameStore()
  const { address } = useWalletStore()
  const { availableFp } = useAvailableFp()
  const navigate = useNavigate()

  // Join game state
  const [joinInput, setJoinInput] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)

  // Faction check state
  const [hasFaction, setHasFaction] = useState<boolean | null>(null)
  const [checkingFaction, setCheckingFaction] = useState(true)

  // Guard against React StrictMode double-invocation in dev.
  // Also allows re-fetch if the wallet address changes.
  const lobbyFetchRef = useRef<string | null>(null)

  // Check faction status on mount / address change
  useEffect(() => {
    if (!address || lobbyFetchRef.current === address) return
    lobbyFetchRef.current = address

    const checkFaction = async () => {
      setCheckingFaction(true)

      try {
        const hasFactionResult = await hasFactionSelected(address)
        setHasFaction(hasFactionResult)
      } catch (err) {
        console.error('Failed to check faction:', err)
        setHasFaction(false)
      } finally {
        setCheckingFaction(false)
      }
    }

    checkFaction()
  }, [address])

  const handleCreateGame = async () => {
    if (!wagerInput || parseFloat(wagerInput) <= 0) {
      setError('Please enter a valid wager amount')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Generate session ID
      const sessionId = Math.floor(Date.now() / 1000) % 1000000000

      // TODO: Actually create the game via contract
      // For now, navigate to game page with new session
      navigate(`/game/${sessionId}?mode=create&wager=${wagerInput}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setIsCreating(false)
    }
  }

  const handleJoinGame = async () => {
    if (!joinInput.trim()) {
      setError('Please enter a session ID or invite link')
      return
    }

    setIsJoining(true)
    setError(null)

    try {
      // Check if it's a URL with session ID
      let sessionId: string
      let authXdr: string | undefined

      try {
        const url = new URL(joinInput)
        // Prefer explicit query params if present, but also support deep links like:
        // http://.../game/123?mode=join&auth=...
        sessionId =
          url.searchParams.get('session') ||
          url.searchParams.get('sessionId') ||
          url.searchParams.get('session_id') ||
          ''

        if (!sessionId) {
          const match = url.pathname.match(/\/game\/(\d+)/)
          if (match?.[1]) sessionId = match[1]
        }

        authXdr = url.searchParams.get('auth') || undefined
      } catch {
        // Not a URL, assume it's a session ID
        sessionId = joinInput.trim()
      }

      if (!sessionId || isNaN(parseInt(sessionId))) {
        throw new Error('Invalid session ID')
      }

      // Navigate to game page with join mode
      const params = new URLSearchParams({ mode: 'join' })
      if (authXdr) params.set('auth', authXdr)
      if (wagerInput) params.set('wager', wagerInput)

      navigate(`/game/${sessionId}?${params.toString()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game')
    } finally {
      setIsJoining(false)
    }
  }

  // Show loading while checking faction
  if (checkingFaction) {
    return (
      <div className="max-w-xl mx-auto mt-8">
        <div className="card-elevated text-center py-12">
          <div className="spinner mx-auto mb-4 w-12 h-12 border-4" />
          <h2 className="font-display font-bold text-xl mb-2">Loading...</h2>
          <p className="text-game-muted">Checking your account status</p>
        </div>
      </div>
    )
  }

  // Show faction required message
  if (hasFaction === false) {
    return (
      <div className="max-w-xl mx-auto mt-8">
        <div className="card-elevated text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-3xl">⚔️</span>
          </div>
          <h2 className="font-display font-bold text-xl mb-2">Choose Your Faction</h2>
          <p className="text-game-muted mb-6 max-w-sm mx-auto">
            Before you can play, you need to select a faction on Ohloss. Your faction determines which team you're fighting for!
          </p>
          <a
            href={import.meta.env.VITE_OHLOSS_URL || 'http://localhost:5173'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Go to Ohloss
          </a>
          <p className="text-game-muted text-xs mt-4">
            After selecting a faction, refresh this page to continue.
          </p>
        </div>
      </div>
    )
  }

  if (mode === 'menu') {
    return (
      <div className="max-w-xl mx-auto mt-8">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Game Lobby</h1>
          <p className="text-game-muted">
            Create a new game or join an existing one
          </p>
        </div>

        {/* Stats Card */}
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-game-muted text-sm">Available FP</p>
              <p className="font-display font-bold text-2xl text-game-primary">
                {formatWager(availableFp)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-game-primary/10 flex items-center justify-center">
              <span className="text-2xl">⚡</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setMode('create')}
            className="card-elevated hover:shadow-game-lg transition-shadow group cursor-pointer text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-game-primary to-indigo-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <span className="text-white text-2xl">+</span>
            </div>
            <h3 className="font-display font-bold text-lg mb-1">Create Game</h3>
            <p className="text-game-muted text-sm">
              Start a new game and invite a friend
            </p>
          </button>

          <button
            onClick={() => setMode('join')}
            className="card-elevated hover:shadow-game-lg transition-shadow group cursor-pointer text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-game-secondary to-pink-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <span className="text-white text-2xl">→</span>
            </div>
            <h3 className="font-display font-bold text-lg mb-1">Join Game</h3>
            <p className="text-game-muted text-sm">
              Enter a session ID or paste invite link
            </p>
          </button>
        </div>

        {/* How to Play */}
        <div className="mt-8 card">
          <h3 className="font-semibold mb-3">How to Play</h3>
          <ol className="list-decimal list-inside space-y-2 text-game-muted text-sm">
            <li>Create a game or join one with a friend</li>
            <li>Both players set their wager (in FP)</li>
            <li>Pick a number between 1 and 10</li>
            <li>Closest to the winning number wins!</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <button
        onClick={() => setMode('menu')}
        className="flex items-center gap-2 text-game-muted hover:text-game-text mb-6 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Lobby
      </button>

      <div className="card-elevated">
        <h2 className="font-display font-bold text-xl mb-6">
          {mode === 'create' ? 'Create New Game' : 'Join Game'}
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {mode === 'create' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-game-text mb-2">
                Your Wager (FP)
              </label>
              <input
                type="number"
                value={wagerInput}
                onChange={(e) => setWagerInput(e.target.value)}
                placeholder="Enter amount"
                className="input"
                min="0"
                step="0.01"
              />
              <p className="text-game-muted text-xs mt-1">
                Available: {formatWager(availableFp)} FP
              </p>
            </div>

            <button
              onClick={handleCreateGame}
              disabled={isCreating}
              className="btn btn-primary w-full"
            >
              {isCreating ? (
                <>
                  <span className="spinner mr-2" />
                  Creating...
                </>
              ) : (
                'Create Game'
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-game-text mb-2">
                Session ID or Invite Link
              </label>
              <input
                type="text"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Enter session ID or paste invite URL"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-game-text mb-2">
                Your Wager (FP)
              </label>
              <input
                type="number"
                value={wagerInput}
                onChange={(e) => setWagerInput(e.target.value)}
                placeholder="Enter amount"
                className="input"
                min="0"
                step="0.01"
              />
              <p className="text-game-muted text-xs mt-1">
                Available: {formatWager(availableFp)} FP
              </p>
            </div>

            <button
              onClick={handleJoinGame}
              disabled={isJoining}
              className="btn btn-secondary w-full"
            >
              {isJoining ? (
                <>
                  <span className="spinner mr-2" />
                  Joining...
                </>
              ) : (
                'Join Game'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
