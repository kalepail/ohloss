import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useWalletStore } from '@/store/walletStore'
import { useGameStore, determineRole, determinePhase } from '@/store/gameStore'
import { usePendingGamesStore } from '@/store/pendingGamesStore'
import { useAvailableFp } from '@/hooks/useAvailableFp'
import { formatAddress, formatWager, parseWager } from '@/types/game'
import type { GameState, PlayerRole, GamePhase } from '@/types/game'
import NumberSelector from '@/components/NumberSelector'
import PlayerCard from '@/components/PlayerCard'
import ShareInvite from '@/components/ShareInvite'
import Confetti from '@/components/Confetti'
import * as numberGuessService from '@/services/numberGuessService'
import * as ohlossService from '@/services/ohlossService'
import { preFillFpCache } from '@/hooks/useAvailableFp'
import { walletBridge } from '@/services/walletBridge'

export default function GamePage() {
  const { sessionId: sessionIdParam } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const { address } = useWalletStore()
  const {
    gameState,
    setGameState,
    phase,
    setPhase,
    role,
    setRole,
    selectedNumber,
    setSelectedNumber,
    isLoading,
    setLoading,
    error,
    setError,
    inviteAuthXdr,
    setInviteAuthXdr,
    wagerInput,
    setWagerInput,
    setAvailableFp,
    reset,
  } = useGameStore()

  // Pending games persistence
  const { getGame: getPendingGame, addGame: addPendingGame, updateGameStatus, updateGame } = usePendingGamesStore()

  // Player's available FP (for capping wager)
  const { availableFp } = useAvailableFp()

  // Parse URL params
  const mode = searchParams.get('mode') || 'view'
  const authFromUrl = searchParams.get('auth')
  const wagerFromUrl = searchParams.get('wager')
  const sessionIdRaw = sessionIdParam ? Number(sessionIdParam) : null
  const sessionId = sessionIdRaw !== null && Number.isFinite(sessionIdRaw) ? sessionIdRaw : null

  // Local state
  const [showConfetti, setShowConfetti] = useState(false)
  const [pollingActive, setPollingActive] = useState(false)
  const [hasFaction, setHasFaction] = useState<boolean | null>(null) // null = checking
  const [checkingFaction, setCheckingFaction] = useState(true)
  const [invitePasteValue, setInvitePasteValue] = useState('')

  // Best-effort ledger tracking for invite TTL display
  const [currentLedger, setCurrentLedger] = useState<number | null>(null)
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null

    const refresh = async () => {
      setCurrentLedger(await numberGuessService.getLatestLedgerSequence())
    }

    // Only poll when we're on invite-related phases.
    if (phase === 'waiting' || phase === 'join_review') {
      refresh()
      t = setInterval(refresh, 30_000)
    }

    return () => {
      if (t) clearInterval(t)
    }
  }, [phase])

  // Track wagerInput in a ref so initialization effects don't depend on it (avoids reruns).
  const wagerInputRef = useRef(wagerInput)
  useEffect(() => {
    wagerInputRef.current = wagerInput
  }, [wagerInput])

  // Use refs for guards (sync updates, survives StrictMode double-invocation)
  const createInProgressRef = useRef(false)
  const joinInProgressRef = useRef(false)
  const factionCheckRef = useRef(false)

  // Initialize wager from URL params (runs once on mount)
  const wagerInitializedRef = useRef(false)
  useEffect(() => {
    if (wagerFromUrl && !wagerInitializedRef.current) {
      wagerInitializedRef.current = true
      setWagerInput(wagerFromUrl)
    }
  }, [wagerFromUrl, setWagerInput])

  // Check if player has selected a faction AND pre-fetch available FP in one batched call
  // This reduces 5 RPC calls down to 1-2 on initial page load
  useEffect(() => {
    if (!address || factionCheckRef.current) return
    factionCheckRef.current = true

    const loadInitialData = async () => {
      setCheckingFaction(true)
      const data = await ohlossService.getGamePageData(address)
      setHasFaction(data.hasFaction)
      // Set the store value directly AND fill the cache for other components
      setAvailableFp(data.availableFp)
      preFillFpCache(address, data.availableFp)
      setCheckingFaction(false)
    }

    loadInitialData()
  }, [address, setAvailableFp])

  // Fetch game state
  const fetchGameState = useCallback(async () => {
    if (!sessionId) return

    try {
      const state = await numberGuessService.getGame(sessionId)
      if (state) {
        setError(null)
        setGameState(state)
        const newRole = determineRole(address, state)
        setRole(newRole)
        const newPhase = determinePhase(state, newRole)
        setPhase(newPhase)

        // Update pending game status based on game state
        if (address) {
          if (state.winner) {
            // Game complete - save winner info and guesses
            const isPlayer1 = state.player1 === address
            updateGame(sessionId, address, {
              status: 'complete',
              winner: state.winner,
              winningNumber: state.winningNumber ?? undefined,
              didWin: state.winner === address,
              yourGuess: isPlayer1 ? (state.player1Guess ?? undefined) : (state.player2Guess ?? undefined),
              opponentGuess: isPlayer1 ? (state.player2Guess ?? undefined) : (state.player1Guess ?? undefined),
            })
          } else if (state.player1Guess !== null && state.player2Guess !== null) {
            updateGameStatus(sessionId, address, 'ready_to_reveal')
          } else if (
            (newRole === 'player1' && state.player1Guess !== null) ||
            (newRole === 'player2' && state.player2Guess !== null)
          ) {
            updateGameStatus(sessionId, address, 'waiting_for_guess')
          } else if (state.player1 && state.player2) {
            // Both players in game, ready to play
            updateGameStatus(sessionId, address, 'ready_to_play')
          }
        }

        // Show confetti on win
        if (state.winner && state.winner === address && !showConfetti) {
          setShowConfetti(true)
        }
      } else {
        // Game doesn't exist on-chain (yet).
        // If we have a locally-saved invite (P1 already signed), we should stay in the
        // "waiting" flow (share invite) instead of showing "Game not started yet".
        const pending = address ? getPendingGame(sessionId, address) : undefined
        const hasLocalInvite =
          !!inviteAuthXdr ||
          (!!pending && pending.status === 'waiting_for_player2' && !!pending.authEntryXdr)

        setGameState(null)
        setRole(null)

        if (!hasLocalInvite) {
          // Avoid blank screen by moving to an explicit phase for viewers.
          if (phase === 'loading_game' || phase === 'lobby' || phase === 'awaiting_start') {
            setPhase('awaiting_start')
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch game state:', err)
      setError('Failed to load game from the network. Please try again.')
    }
  }, [
    sessionId,
    address,
    setGameState,
    setRole,
    setPhase,
    showConfetti,
    updateGameStatus,
    phase,
    setError,
    getPendingGame,
    inviteAuthXdr,
  ])

  // Poll for game updates (~1 ledger time)
  useEffect(() => {
    if (!sessionId || !pollingActive) return

    const interval = setInterval(fetchGameState, 6000)
    return () => clearInterval(interval)
  }, [sessionId, pollingActive, fetchGameState])

  // Invite/join state (player2)
  const [joinAuthXdr, setJoinAuthXdr] = useState<string | null>(null)
  const [inviteInfo, setInviteInfo] = useState<
    | { sessionId: number; player1: string; player1Wager: bigint }
    | null
  >(null)

  // Track if user has manually edited wager (to avoid overwriting their input)
  const userEditedWagerRef = useRef(false)

  // When availableFp loads and we have invite info, cap the wager if needed
  useEffect(() => {
    if (!inviteInfo || availableFp === 0n || userEditedWagerRef.current) return

    const p1WagerNum = Number(inviteInfo.player1Wager) / 10_000_000
    const availableNum = Number(availableFp) / 10_000_000
    const currentWager = parseFloat(wagerInput || '0')

    // If current wager exceeds available FP, cap it
    if (currentWager > availableNum) {
      const cappedWager = Math.min(p1WagerNum, availableNum)
      setWagerInput(String(cappedWager))
    }
  }, [availableFp, inviteInfo, wagerInput, setWagerInput])

  // Initialize game based on mode
  const initKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!sessionId || !address) return

    // Guard: this effect should only run once per (sessionId, mode, authFromUrl, address)
    // to avoid re-processing invites / restoring pending games when unrelated state changes.
    const initKey = `${sessionId}:${mode}:${authFromUrl || ''}:${address}`
    if (initKeyRef.current === initKey) return
    initKeyRef.current = initKey

    const init = async () => {
      // FIRST: Check localStorage for an entry for this session.
      // This prevents re-prompting (P1) and enables resuming already-started games (P2).
      const pendingGame = getPendingGame(sessionId, address)

      if (pendingGame && pendingGame.status === 'waiting_for_player2' && pendingGame.authEntryXdr) {
        // Player 1 already signed; restore invite-sharing state.
        console.log('[GamePage] Restoring pending invite from storage:', pendingGame)
        setInviteAuthXdr(pendingGame.authEntryXdr)
        setWagerInput(pendingGame.wager)
        setPhase('waiting')
        setPollingActive(true)
        fetchGameState()
        return
      }

      if (pendingGame && pendingGame.status !== 'waiting_for_player2') {
        // Game has started or completed - just load the state from chain
        console.log('[GamePage] Restoring game from storage:', pendingGame)
        if (pendingGame.wager) setWagerInput(pendingGame.wager)
        setError(null)
        setPhase('loading_game')
        setPollingActive(true)
        fetchGameState()
        return
      }

      // IMPORTANT: Check if game exists on-chain before trying to create
      // This handles the case where URL still has mode=create but game is done
      const existingGame = await numberGuessService.getGame(sessionId)
      if (existingGame) {
        console.log('[GamePage] Game already exists on-chain, loading:', existingGame)
        setError(null)
        setGameState(existingGame)
        const newRole = determineRole(address, existingGame)
        setRole(newRole)
        const newPhase = determinePhase(existingGame, newRole)
        setPhase(newPhase)
        setPollingActive(true)
        return
      }

      if (mode === 'create') {
        // If wager is provided in URL (user came from lobby), auto-trigger creation
        // Otherwise show setup UI for user to enter wager
        if (wagerFromUrl) {
          // Set wager and trigger auto-creation
          setWagerInput(wagerFromUrl)
          setPhase('creating')

          // Trigger game creation (similar to handleCreateGame but inline)
          const autoCreate = async () => {
            // Pre-open popup synchronously
            const preopenResult = walletBridge.preopen()
            if ('error' in preopenResult) {
              setError(preopenResult.error)
              setPhase('setup')
              return
            }

            try {
              const wager = parseWager(wagerFromUrl)
              const result = await numberGuessService.prepareStartGame(sessionId, address, wager)

              if ('error' in result) {
                throw new Error(result.error)
              }

              setInviteAuthXdr(result.authEntryXdr)
              setPhase('waiting')
              setPollingActive(true)

              const authExpirationLedger = numberGuessService.getAuthEntryExpirationLedger(result.authEntryXdr)

              addPendingGame({
                sessionId,
                playerAddress: address,
                role: 'player1',
                authEntryXdr: result.authEntryXdr,
                authExpirationLedger: authExpirationLedger ?? undefined,
                wager: wagerFromUrl,
                status: 'waiting_for_player2',
              })

              fetchGameState()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to create game')
              setPhase('setup')
            }
          }

          autoCreate()
        } else {
          // No wager in URL - show setup UI for user to enter wager
          setPhase('setup')
        }
        return
      }

      if (mode === 'join' && authFromUrl) {
        // IMPORTANT: do NOT auto-submit join transactions.
        // The invited player should review the invite and choose their wager first.
        setJoinAuthXdr(authFromUrl)

        try {
          const parsed = numberGuessService.parseAuthEntry(authFromUrl)
          setInviteInfo({
            sessionId: parsed.sessionId,
            player1: parsed.player1,
            player1Wager: parsed.player1Wager,
          })

          // If no wager was provided, default P2 wager to min(P1 wager, available FP).
          // Only do this if the user hasn't already typed something and there was no wager in the URL.
          if (!wagerFromUrl && !wagerInputRef.current) {
            const p1WagerNum = Number(parsed.player1Wager) / 10_000_000
            const availableNum = Number(availableFp) / 10_000_000
            const defaultWager = availableFp > 0n ? Math.min(p1WagerNum, availableNum) : p1WagerNum
            setWagerInput(String(defaultWager))
          }

          // Check if the game is already started on-chain.
          // If it is, jump straight into the game UI (and save to Your Games for Player 2).
          const existing = await numberGuessService.getGame(sessionId)
          if (existing) {
            setError(null)
            setGameState(existing)
            const newRole = determineRole(address, existing)
            setRole(newRole)
            const newPhase = determinePhase(existing, newRole)
            setPhase(newPhase)
            setPollingActive(true)

            // Ensure Player 2 has this game in local storage for revisit.
            // (If you were invited but the game already started, you should be able to resume.)
            const alreadySaved = getPendingGame(sessionId, address)
            if (!alreadySaved) {
              addPendingGame({
                sessionId,
                playerAddress: address,
                role: 'player2',
                wager: wagerInputRef.current || wagerFromUrl || '10',
                status: 'ready_to_play',
                opponentAddress: existing.player1,
              })
            }

            return
          }
        } catch (err) {
          console.error('Failed to parse invite auth entry:', err)
          setError('Invalid invite link (could not parse auth entry).')
        }

        setPhase('join_review')
        return
      }

      // View/existing game mode - check if game exists on chain
      setError(null)
      setPhase('loading_game')
      fetchGameState()
      setPollingActive(true)
    }

    void init()
  }, [
    sessionId,
    mode,
    authFromUrl,
    address,
    wagerFromUrl,
    setPhase,
    setWagerInput,
    setError,
    getPendingGame,
    addPendingGame,
    fetchGameState,
    setInviteAuthXdr,
    setGameState,
    setRole,
    setPollingActive,
    inviteAuthXdr,
  ])

  const handleTryLoadInvite = () => {
    if (!sessionId) return

    const input = invitePasteValue.trim()
    if (!input) {
      setError('Paste an invite link or signed auth entry to join.')
      return
    }

    try {
      let authXdr = input
      try {
        const url = new URL(input)
        const auth = url.searchParams.get('auth')
        if (!auth) throw new Error('No auth parameter found in invite link.')
        authXdr = auth
      } catch {
        // Not a URL; treat as raw XDR.
      }

      const parsed = numberGuessService.parseAuthEntry(authXdr)
      if (parsed.sessionId !== sessionId) {
        throw new Error(`Invite is for session #${parsed.sessionId}, but you are viewing #${sessionId}.`)
      }

      setJoinAuthXdr(authXdr)
      setInviteInfo({
        sessionId: parsed.sessionId,
        player1: parsed.player1,
        player1Wager: parsed.player1Wager,
      })

      // If no wager was provided, default P2 wager to min(P1 wager, available FP).
      if (!wagerFromUrl && !wagerInputRef.current) {
        const p1WagerNum = Number(parsed.player1Wager) / 10_000_000
        const availableNum = Number(availableFp) / 10_000_000
        const defaultWager = availableFp > 0n ? Math.min(p1WagerNum, availableNum) : p1WagerNum
        setWagerInput(String(defaultWager))
      }

      setError(null)
      setPhase('join_review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid invite data')
    }
  }

  const handleRetryLoadGame = async () => {
    if (!sessionId) return
    setError(null)
    setPhase('loading_game')
    await fetchGameState()
  }

  // Create game flow
  const handleCreateGame = async () => {
    if (!address || !sessionId) return

    // Prevent duplicate calls (React StrictMode runs effects twice)
    // Use ref for synchronous check - state updates are async and won't block fast duplicate calls
    if (createInProgressRef.current) return
    createInProgressRef.current = true

    // Pre-open popup synchronously BEFORE any state updates (Safari popup blocker)
    // This must happen in the user gesture context before any async work or re-renders
    const preopen = walletBridge.preopen()
    if ('error' in preopen) {
      setError(preopen.error)
      createInProgressRef.current = false
      return
    }

    setLoading(true)
    setError(null)
    setPhase('creating')

    try {
      const wager = parseWager(wagerInput || '10')

      // Prepare the start game transaction and sign auth entry
      const result = await numberGuessService.prepareStartGame(
        sessionId,
        address,
        wager
      )

      if ('error' in result) {
        throw new Error(result.error)
      }

      // Store the signed auth entry for sharing
      setInviteAuthXdr(result.authEntryXdr)
      setPhase('waiting')
      setPollingActive(true)

      const authExpirationLedger = numberGuessService.getAuthEntryExpirationLedger(
        result.authEntryXdr
      )

      // Persist to localStorage so we can restore on page reload
      addPendingGame({
        sessionId,
        playerAddress: address,
        role: 'player1',
        authEntryXdr: result.authEntryXdr,
        authExpirationLedger: authExpirationLedger ?? undefined,
        wager: wagerInput || '10',
        status: 'waiting_for_player2',
      })

      // Start polling for opponent
      fetchGameState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
      // Return to a setup view so the user can adjust wager and retry without leaving the page.
      setPhase('setup')
      createInProgressRef.current = false // Allow retry on error
    } finally {
      setLoading(false)
    }
  }

  // Join game with auth entry (player2) - user-triggered from join review
  const handleJoinWithAuth = async (authXdr: string) => {
    if (!address || !sessionId) return

    // Prevent duplicate calls
    if (joinInProgressRef.current) return
    joinInProgressRef.current = true

    // Pre-open popup synchronously BEFORE any async work (Safari popup blocker)
    const preopen = walletBridge.preopen()
    if ('error' in preopen) {
      setError(preopen.error)
      joinInProgressRef.current = false
      return
    }

    setLoading(true)
    setError(null)
    setPhase('joining')

    try {
      const wager = parseWager(wagerInput || '10')

      // If the game already exists on-chain, do not attempt to start again.
      const existing = await numberGuessService.getGame(sessionId)
      if (existing) {
        addPendingGame({
          sessionId,
          playerAddress: address,
          role: 'player2',
          wager: wagerInput || '10',
          status: 'ready_to_play',
          opponentAddress: existing.player1,
        })
        await fetchGameState()
        setPollingActive(true)
        return
      }

      // Import auth entry and finalize game start
      const result = await numberGuessService.joinGame(
        sessionId,
        authXdr,
        address,
        wager
      )

      if ('error' in result) {
        throw new Error(result.error)
      }

      // Persist for Player 2 so they can revisit via "Your Games".
      // Save before fetching state so fetchGameState can update status immediately.
      addPendingGame({
        sessionId,
        playerAddress: address,
        role: 'player2',
        wager: wagerInput || '10',
        status: 'ready_to_play',
        opponentAddress: inviteInfo?.player1,
      })

      // Game started successfully!
      await fetchGameState()
      setPollingActive(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game')
      joinInProgressRef.current = false // Allow retry on error
      setPhase('join_review')
    } finally {
      setLoading(false)
    }
  }

  // Submit guess
  const handleSubmitGuess = async () => {
    if (!address || !sessionId || selectedNumber === null) return

    setLoading(true)
    setError(null)

    try {
      const result = await numberGuessService.makeGuess(
        sessionId,
        address,
        selectedNumber
      )

      if ('error' in result) {
        throw new Error(result.error)
      }

      // Refresh game state
      fetchGameState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit guess')
    } finally {
      setLoading(false)
    }
  }

  // Reveal winner
  const handleRevealWinner = async () => {
    if (!sessionId) return

    setLoading(true)
    setError(null)

    try {
      const result = await numberGuessService.revealWinner(sessionId)

      if ('error' in result) {
        throw new Error(result.error)
      }

      // Refresh game state
      fetchGameState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal winner')
    } finally {
      setLoading(false)
    }
  }

  // Back to lobby
  const handleBackToLobby = () => {
    reset()
    navigate('/lobby')
  }

  return (
    <div className="max-w-2xl mx-auto">
      {showConfetti && <Confetti />}

      {/* Back button */}
      <button
        onClick={handleBackToLobby}
        className="flex items-center gap-2 text-game-muted hover:text-game-text mb-6 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Lobby
      </button>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-500 text-xs underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Faction check - show if not selected */}
      {checkingFaction ? (
        <div className="card-elevated text-center py-12">
          <div className="spinner mx-auto mb-4 w-12 h-12 border-4" />
          <h2 className="font-display font-bold text-xl mb-2">Loading...</h2>
          <p className="text-game-muted">Checking your account status</p>
        </div>
      ) : hasFaction === false ? (
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
      ) : (
        <>
          {/* Phase-specific content */}
          {phase === 'setup' && mode === 'create' && sessionId && (
            <CreateSetupPhase
              sessionId={sessionId}
              wagerInput={wagerInput}
              availableFp={availableFp}
              isLoading={isLoading}
              onChangeWager={setWagerInput}
              onCreate={handleCreateGame}
            />
          )}

          {phase === 'loading_game' && (
            <LoadingGamePhase sessionId={sessionId} />
          )}

          {phase === 'awaiting_start' && sessionId && (
            <AwaitingStartPhase
              sessionId={sessionId}
              isJoinIntent={mode === 'join'}
              invitePasteValue={invitePasteValue}
              onChangeInvitePasteValue={setInvitePasteValue}
              onTryLoadInvite={handleTryLoadInvite}
              onRetryLoadGame={handleRetryLoadGame}
            />
          )}

          {phase === 'creating' && (
            <CreatingPhase isLoading={isLoading} />
          )}

          {phase === 'waiting' && inviteAuthXdr && sessionId && (
            <WaitingPhase
              sessionId={sessionId}
              authXdr={inviteAuthXdr}
              wager={wagerInput}
              currentLedger={currentLedger}
            />
          )}

          {phase === 'join_review' && sessionId && joinAuthXdr && inviteInfo && (
            <JoinReviewPhase
              sessionId={sessionId}
              player1={inviteInfo.player1}
              player1Wager={inviteInfo.player1Wager}
              player2={address}
              wagerInput={wagerInput}
              onChangeWager={(val) => {
                userEditedWagerRef.current = true
                setWagerInput(val)
              }}
              onJoin={() => handleJoinWithAuth(joinAuthXdr)}
              isLoading={isLoading}
              currentLedger={currentLedger}
              authXdr={joinAuthXdr}
            />
          )}

          {phase === 'joining' && (
            <JoiningPhase isLoading={isLoading} />
          )}

          {(phase === 'guessing' || phase === 'waiting_guess') && gameState && (
            <GuessingPhase
              gameState={gameState}
              role={role}
              phase={phase}
              selectedNumber={selectedNumber}
              onSelectNumber={setSelectedNumber}
              onSubmitGuess={handleSubmitGuess}
              isLoading={isLoading}
              address={address}
            />
          )}

          {phase === 'revealing' && gameState && (
            <RevealingPhase
              gameState={gameState}
              role={role}
              onReveal={handleRevealWinner}
              isLoading={isLoading}
            />
          )}

          {phase === 'complete' && gameState && (
            <CompletePhase
              gameState={gameState}
              role={role}
              address={address}
              onPlayAgain={handleBackToLobby}
            />
          )}
        </>
      )}
    </div>
  )
}

// Phase Components

function CreateSetupPhase({
  sessionId: _sessionId,
  wagerInput,
  availableFp,
  isLoading,
  onChangeWager,
  onCreate,
}: {
  sessionId: number
  wagerInput: string
  availableFp: bigint
  isLoading: boolean
  onChangeWager: (v: string) => void
  onCreate: () => void
}) {
  // Intentionally mirrors the Lobby "Create New Game" card so the UI doesn't
  // jump to a different layout after an error.
  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="card-elevated">
        <h2 className="font-display font-bold text-xl mb-6">Create New Game</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-game-text mb-2">
              Your Wager (FP)
            </label>
            <input
              type="number"
              value={wagerInput}
              onChange={(e) => onChangeWager(e.target.value)}
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
            onClick={onCreate}
            disabled={isLoading}
            className="btn btn-primary w-full"
          >
            {isLoading ? (
              <>
                <span className="spinner-light" />
                Creating...
              </>
            ) : (
              'Create Game'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function LoadingGamePhase({ sessionId }: { sessionId: number | null }) {
  return (
    <div className="card-elevated text-center py-12">
      <div className="spinner mx-auto mb-4 w-12 h-12 border-4" />
      <h2 className="font-display font-bold text-xl mb-2">Loading Game…</h2>
      <p className="text-game-muted">
        {sessionId ? `Checking session #${sessionId} on-chain` : 'Checking session on-chain'}
      </p>
    </div>
  )
}

function AwaitingStartPhase({
  sessionId,
  isJoinIntent,
  invitePasteValue,
  onChangeInvitePasteValue,
  onTryLoadInvite,
  onRetryLoadGame,
}: {
  sessionId: number
  isJoinIntent: boolean
  invitePasteValue: string
  onChangeInvitePasteValue: (v: string) => void
  onTryLoadInvite: () => void
  onRetryLoadGame: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="card-elevated text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-game-primary/10 flex items-center justify-center">
          <span className="text-3xl">🕵️</span>
        </div>
        <h2 className="font-display font-bold text-xl mb-2">Game not started yet</h2>
        <p className="text-game-muted mb-4 max-w-md mx-auto">
          Session <span className="font-mono">#{sessionId}</span> isn’t available on-chain yet.
          {isJoinIntent
            ? ' A session ID alone can only load once the game has been started.'
            : ''}
        </p>

        <button onClick={onRetryLoadGame} className="btn btn-secondary">
          Check Again
        </button>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2">Have an invite link?</h3>
        <p className="text-game-muted text-sm mb-4">
          Paste the invite URL (with <span className="font-mono">auth=...</span>) or the signed auth entry XDR to load the invite and join.
        </p>

        <textarea
          value={invitePasteValue}
          onChange={(e) => onChangeInvitePasteValue(e.target.value)}
          placeholder="Paste invite link or signed auth entry XDR"
          className="input min-h-[96px] font-mono text-xs"
        />

        <button onClick={onTryLoadInvite} className="btn btn-primary w-full mt-4">
          Load Invite
        </button>
      </div>
    </div>
  )
}

function CreatingPhase({ isLoading: _isLoading }: { isLoading: boolean }) {
  return (
    <div className="card-elevated text-center py-12">
      <div className="spinner mx-auto mb-4 w-12 h-12 border-4" />
      <h2 className="font-display font-bold text-xl mb-2">Creating Game...</h2>
      <p className="text-game-muted">
        Please sign the transaction in your wallet
      </p>
    </div>
  )
}

function WaitingPhase({
  sessionId,
  authXdr,
  wager,
  currentLedger,
}: {
  sessionId: number
  authXdr: string
  wager: string
  currentLedger: number | null
}) {
  return (
    <div className="space-y-6">
      <div className="card-elevated text-center">
        {(() => {
          const exp = numberGuessService.getAuthEntryExpirationLedger(authXdr)
          if (!exp) return null
          if (!currentLedger) {
            return (
              <p className="text-game-muted text-xs mt-2">
                Invite validity: unknown
              </p>
            )
          }

          const remainingLedgers = exp - currentLedger
          const remainingSeconds = remainingLedgers * 5

          if (remainingSeconds <= 0) {
            return (
              <p className="text-red-600 text-xs mt-2">
                Invite expired — re-sign to generate a new invite
              </p>
            )
          }

          const hours = Math.floor(remainingSeconds / 3600)
          const minutes = Math.floor((remainingSeconds % 3600) / 60)

          return (
            <p className="text-game-muted text-xs mt-2">
              Invite valid for {hours}h {minutes}m
            </p>
          )
        })()}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-game-primary/10 flex items-center justify-center">
          <div className="relative">
            <span className="text-3xl">⏳</span>
            <div className="absolute inset-0 bg-game-primary/30 rounded-full pulse-ring" />
          </div>
        </div>
        <h2 className="font-display font-bold text-xl mb-2">
          Waiting for Opponent
        </h2>
        <p className="text-game-muted mb-4">
          Share the invite link below to start the game
        </p>
        <div className="badge badge-info">
          Session: #{sessionId}
        </div>
      </div>

      <ShareInvite sessionId={sessionId} authXdr={authXdr} wager={wager} />
    </div>
  )
}

function JoinReviewPhase({
  sessionId,
  player1,
  player1Wager,
  player2,
  wagerInput,
  onChangeWager,
  onJoin,
  isLoading,
  currentLedger,
  authXdr,
}: {
  sessionId: number
  player1: string
  player1Wager: bigint
  player2: string | null
  wagerInput: string
  onChangeWager: (v: string) => void
  onJoin: () => void
  isLoading: boolean
  currentLedger: number | null
  authXdr: string
}) {
  return (
    <div className="space-y-6">
      <div className="card-elevated">
        <h2 className="font-display font-bold text-xl mb-2">You’ve been invited!</h2>
        <p className="text-game-muted">
          Review the game details, choose your wager, then sign to start the game.
        </p>

        {(() => {
          const exp = numberGuessService.getAuthEntryExpirationLedger(authXdr)
          if (!exp) return null
          if (!currentLedger) {
            return (
              <p className="text-game-muted text-xs mt-2">
                Invite validity: unknown
              </p>
            )
          }

          const remainingLedgers = exp - currentLedger
          const remainingSeconds = remainingLedgers * 5

          if (remainingSeconds <= 0) {
            return (
              <p className="text-red-600 text-xs mt-2">
                Invite expired — ask Player 1 to re-sign
              </p>
            )
          }

          const hours = Math.floor(remainingSeconds / 3600)
          const minutes = Math.floor((remainingSeconds % 3600) / 60)

          return (
            <p className="text-game-muted text-xs mt-2">
              Invite valid for {hours}h {minutes}m
            </p>
          )
        })()}

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-game-muted">Session</span>
            <span className="font-mono">#{sessionId}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-game-muted">Player 1</span>
            <span className="font-mono">{formatAddress(player1)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-game-muted">Player 1 Wager</span>
            <span className="font-semibold">{formatWager(player1Wager)} FP</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-game-muted">You (Player 2)</span>
            <span className="font-mono">{player2 ? formatAddress(player2) : '—'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <label className="block text-sm font-medium text-game-text mb-2">
          Your Wager (FP)
        </label>
        <input
          type="number"
          value={wagerInput}
          onChange={(e) => onChangeWager(e.target.value)}
          placeholder="Enter amount"
          className="input"
          min="0"
          step="0.01"
        />
        <p className="text-game-muted text-xs mt-2">
          This will be signed and submitted from Ohloss to start the game.
        </p>

        <button
          onClick={onJoin}
          disabled={isLoading || !player2}
          className="btn btn-primary w-full mt-4"
        >
          {isLoading ? (
            <>
              <span className="spinner-light" />
              Preparing...
            </>
          ) : (
            'Sign & Start Game'
          )}
        </button>
      </div>
    </div>
  )
}

function JoiningPhase({ isLoading: _isLoading }: { isLoading: boolean }) {
  return (
    <div className="card-elevated text-center py-12">
      <div className="spinner mx-auto mb-4 w-12 h-12 border-4" />
      <h2 className="font-display font-bold text-xl mb-2">Joining Game...</h2>
      <p className="text-game-muted">
        Please sign the transaction in your wallet
      </p>
    </div>
  )
}

function GuessingPhase({
  gameState,
  role,
  phase,
  selectedNumber,
  onSelectNumber,
  onSubmitGuess,
  isLoading,
  address,
}: {
  gameState: GameState
  role: PlayerRole | null
  phase: GamePhase
  selectedNumber: number | null
  onSelectNumber: (n: number | null) => void
  onSubmitGuess: () => void
  isLoading: boolean
  address: string | null
}) {
  const isWaitingForOpponent = phase === 'waiting_guess'
  const hasGuessed = role === 'player1'
    ? gameState.player1Guess !== null
    : gameState.player2Guess !== null

  return (
    <div className="space-y-6">
      {/* Players */}
      <div className="grid grid-cols-2 gap-4">
        <PlayerCard
          label="Player 1"
          address={gameState.player1}
          wager={gameState.player1Wager}
          hasGuessed={gameState.player1Guess !== null}
          isYou={address === gameState.player1}
        />
        <PlayerCard
          label="Player 2"
          address={gameState.player2}
          wager={gameState.player2Wager}
          hasGuessed={gameState.player2Guess !== null}
          isYou={address === gameState.player2}
        />
      </div>

      {/* Guessing UI */}
      <div className="card-elevated">
        {isWaitingForOpponent ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-game-accent/10 flex items-center justify-center">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="font-display font-bold text-xl mb-2">
              Guess Submitted!
            </h2>
            <p className="text-game-muted">
              Waiting for your opponent to make their guess...
            </p>
            <div className="mt-4">
              <span className="spinner" />
            </div>
          </div>
        ) : (
          <>
            <h2 className="font-display font-bold text-xl mb-4 text-center">
              Pick Your Number
            </h2>
            <p className="text-game-muted text-center mb-6">
              Choose a number between 1 and 10. Closest to the winning number wins!
            </p>

            <NumberSelector
              selected={selectedNumber}
              onSelect={onSelectNumber}
              disabled={isLoading || hasGuessed}
            />

            <button
              onClick={onSubmitGuess}
              disabled={selectedNumber === null || isLoading || hasGuessed}
              className="btn btn-primary w-full mt-6"
            >
              {isLoading ? (
                <>
                  <span className="spinner-light" />
                  Submitting...
                </>
              ) : (
                'Lock In Guess'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function RevealingPhase({
  gameState,
  role: _role,
  onReveal,
  isLoading,
}: {
  gameState: GameState
  role: PlayerRole | null
  onReveal: () => void
  isLoading: boolean
}) {
  return (
    <div className="space-y-6">
      {/* Players with guesses */}
      <div className="grid grid-cols-2 gap-4">
        <PlayerCard
          label="Player 1"
          address={gameState.player1}
          wager={gameState.player1Wager}
          hasGuessed={true}
          guess={gameState.player1Guess ?? undefined}
          showGuess={true}
        />
        <PlayerCard
          label="Player 2"
          address={gameState.player2}
          wager={gameState.player2Wager}
          hasGuessed={true}
          guess={gameState.player2Guess ?? undefined}
          showGuess={true}
        />
      </div>

      {/* Reveal button */}
      <div className="card-elevated text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-game-primary to-game-secondary flex items-center justify-center">
          <span className="text-4xl">🎲</span>
        </div>
        <h2 className="font-display font-bold text-xl mb-2">
          Both Players Ready!
        </h2>
        <p className="text-game-muted mb-6">
          Click to reveal the winning number and determine the winner
        </p>

        <button
          onClick={onReveal}
          disabled={isLoading}
          className="btn btn-primary text-lg px-12"
        >
          {isLoading ? (
            <>
              <span className="spinner-light" />
              Revealing...
            </>
          ) : (
            '🎉 Reveal Winner!'
          )}
        </button>
      </div>
    </div>
  )
}

function CompletePhase({
  gameState,
  role: _role,
  address,
  onPlayAgain,
}: {
  gameState: GameState
  role: PlayerRole | null
  address: string | null
  onPlayAgain: () => void
}) {
  const isWinner = gameState.winner === address
  const winnerLabel = gameState.winner === gameState.player1 ? 'Player 1' : 'Player 2'

  return (
    <div className="space-y-6">
      {/* Result banner */}
      <div
        className={`card-elevated text-center ${
          isWinner
            ? 'bg-gradient-to-br from-emerald-50 to-game-accent/10 border-game-accent'
            : 'bg-gradient-to-br from-gray-50 to-gray-100'
        }`}
      >
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-white shadow-lg flex items-center justify-center">
          <span className="text-5xl">{isWinner ? '🏆' : '😔'}</span>
        </div>
        <h2 className="font-display font-bold text-2xl mb-2">
          {isWinner ? 'You Won!' : 'You Lost'}
        </h2>
        <p className="text-game-muted">
          {isWinner
            ? 'Congratulations! Your guess was closest to the winning number.'
            : `${winnerLabel} was closer to the winning number.`}
        </p>
      </div>

      {/* Game results */}
      <div className="card">
        <h3 className="font-semibold mb-4">Game Results</h3>

        {/* Winning number */}
        <div className="flex items-center justify-center mb-6">
          <div className="text-center">
            <p className="text-game-muted text-sm mb-2">Winning Number</p>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-game-primary to-game-secondary flex items-center justify-center animate-number-reveal">
              <span className="text-white text-4xl font-bold">
                {gameState.winningNumber}
              </span>
            </div>
          </div>
        </div>

        {/* Player results */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className={`p-4 rounded-xl ${
              gameState.winner === gameState.player1
                ? 'bg-game-accent/10 border-2 border-game-accent'
                : 'bg-gray-50'
            }`}
          >
            <p className="text-sm text-game-muted mb-1">Player 1</p>
            <p className="font-mono text-sm mb-2">{formatAddress(gameState.player1)}</p>
            <p className="text-2xl font-bold">{gameState.player1Guess}</p>
            <p className="text-game-muted text-sm">
              {formatWager(gameState.player1Wager)} FP
            </p>
            {gameState.winner === gameState.player1 && (
              <span className="badge badge-success mt-2">Winner!</span>
            )}
          </div>
          <div
            className={`p-4 rounded-xl ${
              gameState.winner === gameState.player2
                ? 'bg-game-accent/10 border-2 border-game-accent'
                : 'bg-gray-50'
            }`}
          >
            <p className="text-sm text-game-muted mb-1">Player 2</p>
            <p className="font-mono text-sm mb-2">{formatAddress(gameState.player2)}</p>
            <p className="text-2xl font-bold">{gameState.player2Guess}</p>
            <p className="text-game-muted text-sm">
              {formatWager(gameState.player2Wager)} FP
            </p>
            {gameState.winner === gameState.player2 && (
              <span className="badge badge-success mt-2">Winner!</span>
            )}
          </div>
        </div>
      </div>

      {/* Play again */}
      <button onClick={onPlayAgain} className="btn btn-primary w-full">
        Play Again
      </button>
    </div>
  )
}
