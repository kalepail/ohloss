import { useState, useEffect } from 'react';
import { numberGuessService } from '@/services/numberGuessService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { useWallet } from '@/hooks/useWallet';
import type { Game } from 'number-guess';

interface NumberGuessGameProps {
  userAddress: string;
  currentEpoch: number;
  availableFP: bigint;
  initialXDR?: string | null;
  initialSessionId?: number | null;
  onBack: () => void;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

export function NumberGuessGame({
  userAddress,
  availableFP,
  initialXDR,
  initialSessionId,
  onBack,
  onStandingsRefresh,
  onGameComplete
}: NumberGuessGameProps) {
  const { getContractSigner } = useWallet();
  // Use a session ID that fits in u32 (max 4,294,967,295)
  // Take the last 9 digits of the timestamp to ensure uniqueness while fitting in u32
  const [sessionId, setSessionId] = useState<number>(() => Math.floor(Date.now() / 1000) % 1000000000);
  const [player1Wager, setPlayer1Wager] = useState('0.1');
  const [guess, setGuess] = useState<number | null>(null);
  const [gameState, setGameState] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [gamePhase, setGamePhase] = useState<'create' | 'guess' | 'reveal' | 'complete'>('create');
  const [createMode, setCreateMode] = useState<'create' | 'import' | 'load'>('create');
  const [exportedAuthEntryXDR, setExportedAuthEntryXDR] = useState<string | null>(null);
  const [importAuthEntryXDR, setImportAuthEntryXDR] = useState('');
  const [importSessionId, setImportSessionId] = useState('');
  const [importPlayer1, setImportPlayer1] = useState('');
  const [importPlayer1Wager, setImportPlayer1Wager] = useState('');
  const [importPlayer2Wager, setImportPlayer2Wager] = useState('');
  const [loadSessionId, setLoadSessionId] = useState('');
  const [authEntryCopied, setAuthEntryCopied] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);

  const FP_DECIMALS = 7;

  const parseWager = (value: string): bigint | null => {
    try {
      const cleaned = value.replace(/[^\d.]/g, '');
      if (!cleaned || cleaned === '.') return null;

      const [whole = '0', fraction = ''] = cleaned.split('.');
      const paddedFraction = fraction.padEnd(FP_DECIMALS, '0').slice(0, FP_DECIMALS);
      return BigInt(whole + paddedFraction);
    } catch {
      return null;
    }
  };

  const loadGameState = async () => {
    try {
      // Use short TTL (5s) since game state can change frequently, but still dedupe rapid calls
      const game = await requestCache.dedupe(
        createCacheKey('game-state', sessionId),
        () => numberGuessService.getGame(sessionId),
        5000 // 5 second TTL for game state
      );
      setGameState(game);

      // Determine game phase based on state
      if (game && game.winner !== null && game.winner !== undefined) {
        setGamePhase('complete');
      } else if (game && game.player1_guess !== null && game.player1_guess !== undefined &&
                 game.player2_guess !== null && game.player2_guess !== undefined) {
        setGamePhase('reveal');
      } else {
        setGamePhase('guess');
      }
    } catch (err) {
      // Game doesn't exist yet
      setGameState(null);
    }
  };

  useEffect(() => {
    if (gamePhase !== 'create') {
      loadGameState();
      const interval = setInterval(loadGameState, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [sessionId, gamePhase]);

  // Auto-refresh standings when game completes (for passive player who didn't call reveal_winner)
  useEffect(() => {
    if (gamePhase === 'complete' && gameState?.winner) {
      console.log('Game completed! Refreshing faction standings and dashboard data...');
      onStandingsRefresh(); // This refreshes both standings and Dashboard FP - don't call onGameComplete() here or it will close the game!
    }
  }, [gamePhase, gameState?.winner]);

  // Handle initial values from URL deep linking or props
  // Expected URL formats:
  //   - With auth entry: ?game=number-guess&auth=AAAA... (Session ID, P1 address, P1 wager parsed from auth entry)
  //   - With session ID: ?game=number-guess&session-id=123 (Load existing game)
  // Note: GamesCatalog cleans URL params, so we prioritize props over URL
  useEffect(() => {
    // Priority 1: Check initialXDR prop (from GamesCatalog after URL cleanup)
    if (initialXDR) {
      console.log('[Deep Link] Using initialXDR prop from GamesCatalog');

      try {
        const parsed = numberGuessService.parseAuthEntry(initialXDR);
        const sessionId = parsed.sessionId;

        console.log('[Deep Link] Parsed session ID from initialXDR:', sessionId);

        // Check if game already exists (both players have signed)
        numberGuessService.getGame(sessionId)
          .then((game) => {
            if (game) {
              // Game exists! Load it directly instead of going to import mode
              console.log('[Deep Link] Game already exists, loading directly to guess phase');
              console.log('[Deep Link] Game data:', game);

              // Auto-load the game - bypass create phase entirely
              setGameState(game);
              setGamePhase('guess');
              setSessionId(sessionId); // Set session ID for the game
            } else {
              // Game doesn't exist yet, go to import mode
              console.log('[Deep Link] Game not found, entering import mode');
              setCreateMode('import');
              setImportAuthEntryXDR(initialXDR);
              setImportSessionId(sessionId.toString());
              setImportPlayer1(parsed.player1);
              setImportPlayer1Wager((Number(parsed.player1Wager) / 10_000_000).toString());
              setImportPlayer2Wager('0.1');
            }
          })
          .catch((err) => {
            console.error('[Deep Link] Error checking game existence:', err);
            console.error('[Deep Link] Error details:', {
              message: err?.message,
              stack: err?.stack,
              sessionId: sessionId,
            });
            // If we can't check, default to import mode
            setCreateMode('import');
            setImportAuthEntryXDR(initialXDR);
            setImportSessionId(parsed.sessionId.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Wager((Number(parsed.player1Wager) / 10_000_000).toString());
            setImportPlayer2Wager('0.1');
          });
      } catch (err) {
        console.log('[Deep Link] Failed to parse initialXDR, will retry on import');
        setCreateMode('import');
        setImportAuthEntryXDR(initialXDR);
        setImportPlayer2Wager('0.1');
      }
      return; // Exit early - we processed initialXDR
    }

    // Priority 2: Check URL parameters (for direct navigation without GamesCatalog)
    const urlParams = new URLSearchParams(window.location.search);
    const authEntry = urlParams.get('auth');
    const urlSessionId = urlParams.get('session-id');

    if (authEntry) {
      // Simplified URL format - only auth entry is needed
      // Session ID, Player 1 address, and wager are parsed from auth entry
      console.log('[Deep Link] Auto-populating game from URL with auth entry');

      // Try to parse auth entry to get session ID
      try {
        const parsed = numberGuessService.parseAuthEntry(authEntry);
        const sessionId = parsed.sessionId;

        console.log('[Deep Link] Parsed session ID from URL auth entry:', sessionId);

        // Check if game already exists (both players have signed)
        numberGuessService.getGame(sessionId)
          .then((game) => {
            if (game) {
              // Game exists! Load it directly instead of going to import mode
              console.log('[Deep Link] Game already exists (URL), loading directly to guess phase');
              console.log('[Deep Link] Game data:', game);

              // Auto-load the game - bypass create phase entirely
              setGameState(game);
              setGamePhase('guess');
              setSessionId(sessionId); // Set session ID for the game
            } else {
              // Game doesn't exist yet, go to import mode
              console.log('[Deep Link] Game not found (URL), entering import mode');
              setCreateMode('import');
              setImportAuthEntryXDR(authEntry);
              setImportSessionId(sessionId.toString());
              setImportPlayer1(parsed.player1);
              setImportPlayer1Wager((Number(parsed.player1Wager) / 10_000_000).toString());
              setImportPlayer2Wager('0.1');
            }
          })
          .catch((err) => {
            console.error('[Deep Link] Error checking game existence (URL):', err);
            console.error('[Deep Link] Error details:', {
              message: err?.message,
              stack: err?.stack,
              sessionId: sessionId,
            });
            // If we can't check, default to import mode
            setCreateMode('import');
            setImportAuthEntryXDR(authEntry);
            setImportSessionId(parsed.sessionId.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Wager((Number(parsed.player1Wager) / 10_000_000).toString());
            setImportPlayer2Wager('0.1');
          });
      } catch (err) {
        console.log('[Deep Link] Failed to parse auth entry from URL, will retry on import');
        setCreateMode('import');
        setImportAuthEntryXDR(authEntry);
        setImportPlayer2Wager('0.1');
      }
    } else if (urlSessionId) {
      // Load existing game by session ID
      console.log('[Deep Link] Auto-populating game from URL with session ID');
      setCreateMode('load');
      setLoadSessionId(urlSessionId);
    } else if (initialSessionId !== null && initialSessionId !== undefined) {
      console.log('[Deep Link] Auto-populating session ID from prop:', initialSessionId);
      setCreateMode('load');
      setLoadSessionId(initialSessionId.toString());
    }
  }, [initialXDR, initialSessionId]);

  const handlePrepareTransaction = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const p1Wager = parseWager(player1Wager);

      if (!p1Wager || p1Wager <= 0n) {
        throw new Error('Enter a valid wager amount');
      }

      const signer = getContractSigner();

      // Use placeholder values for Player 2 (they'll rebuild with their own values)
      // Player 2 address: use a random keypair address (just for simulation)
      // Player 2 wager: use same as Player 1 wager (just for simulation)
      const placeholderPlayer2Address = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB'; // Placeholder for simulation
      const placeholderP2Wager = p1Wager; // Same as P1 for simulation

      console.log('Preparing transaction for Player 1 to sign...');
      console.log('Using placeholder Player 2 values for simulation only');
      const authEntryXDR = await numberGuessService.prepareStartGame(
        sessionId,
        userAddress,
        placeholderPlayer2Address,
        p1Wager,
        placeholderP2Wager,
        signer
      );

      console.log('Transaction prepared successfully! Player 1 has signed their auth entry.');
      setExportedAuthEntryXDR(authEntryXDR);
      setSuccess('Auth entry signed! Copy the auth entry XDR or share URL below and send it to Player 2. Waiting for them to sign...');

      // Start polling for the game to be created by Player 2
      const pollInterval = setInterval(async () => {
        try {
          // Try to load the game
          const game = await numberGuessService.getGame(sessionId);
          if (game) {
            console.log('Game found! Player 2 has finalized the transaction. Transitioning to guess phase...');
            clearInterval(pollInterval);

            // Update game state
            setGameState(game);
            setExportedAuthEntryXDR(null);
            setSuccess('Game created! Player 2 has signed and submitted.');
            setGamePhase('guess');

            // Refresh Dashboard to show updated Available FP (locked in game)
            onStandingsRefresh();

            // Clear success message after 2 seconds
            setTimeout(() => setSuccess(null), 2000);
          } else {
            console.log('Game not found yet, continuing to poll...');
          }
        } catch (err) {
          // Game doesn't exist yet, keep polling
          console.log('Polling for game creation...', err instanceof Error ? err.message : 'checking');
        }
      }, 3000); // Poll every 3 seconds

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        console.log('Stopped polling after 5 minutes');
      }, 300000);
    } catch (err) {
      console.error('Prepare transaction error:', err);
      // Extract detailed error message
      let errorMessage = 'Failed to prepare transaction';
      if (err instanceof Error) {
        errorMessage = err.message;

        // Check for common errors
        if (err.message.includes('insufficient')) {
          errorMessage = `Insufficient FP: ${err.message}. Make sure you have enough Faction Points for the wager.`;
        } else if (err.message.includes('auth')) {
          errorMessage = `Authorization failed: ${err.message}. Check your wallet connection.`;
        }
      }

      setError(errorMessage);

      // Keep the component in 'create' phase so user can see the error and retry
    } finally {
      setLoading(false);
    }
  };

  const handleImportTransaction = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Validate required inputs (only auth entry and player 2 wager)
      if (!importAuthEntryXDR.trim()) {
        throw new Error('Enter auth entry XDR from Player 1');
      }
      if (!importPlayer2Wager.trim()) {
        throw new Error('Enter your wager amount (Player 2)');
      }

      // Parse Player 2's wager
      const p2Wager = parseWager(importPlayer2Wager);
      if (!p2Wager || p2Wager <= 0n) {
        throw new Error('Invalid Player 2 wager');
      }

      // Parse auth entry to extract game parameters
      // The auth entry contains: session_id, player1, player1_wager
      console.log('Parsing auth entry to extract game parameters...');
      const gameParams = numberGuessService.parseAuthEntry(importAuthEntryXDR.trim());

      console.log('Extracted from auth entry:', {
        sessionId: gameParams.sessionId,
        player1: gameParams.player1,
        player1Wager: gameParams.player1Wager.toString(),
      });

      // Auto-populate read-only fields from parsed auth entry (for display)
      setImportSessionId(gameParams.sessionId.toString());
      setImportPlayer1(gameParams.player1);
      setImportPlayer1Wager((Number(gameParams.player1Wager) / 10_000_000).toString());

      // Verify the user is Player 2 (prevent self-play)
      if (gameParams.player1 === userAddress) {
        throw new Error('Invalid game: You cannot play against yourself (you are Player 1 in this auth entry)');
      }

      const signer = getContractSigner();

      // Step 1: Import Player 1's signed auth entry and rebuild transaction
      // New simplified API - only needs: auth entry, player 2 address, player 2 wager
      console.log('Importing Player 1 auth entry and rebuilding transaction...');
      const fullySignedTxXDR = await numberGuessService.importAndSignAuthEntry(
        importAuthEntryXDR.trim(),
        userAddress, // Player 2 address (current user)
        p2Wager,
        signer
      );

      // Step 2: Player 2 finalizes and submits (they are the transaction source)
      console.log('Simulating and submitting transaction...');
      await numberGuessService.finalizeStartGame(
        fullySignedTxXDR,
        userAddress,
        signer
      );

      // If we get here, transaction succeeded! Now update state.
      console.log('Transaction submitted successfully! Updating state...');
      setSessionId(gameParams.sessionId);
      setSuccess('Game created successfully! Both players signed.');
      setGamePhase('guess');

      // Clear import fields
      setImportAuthEntryXDR('');
      setImportSessionId('');
      setImportPlayer1('');
      setImportPlayer1Wager('');
      setImportPlayer2Wager('');

      // Load the newly created game state
      await loadGameState();

      // Refresh Dashboard to show updated Available FP (locked in game)
      onStandingsRefresh();

      // Clear success message after 2 seconds
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error('Import transaction error:', err);
      // Extract detailed error message if available
      let errorMessage = 'Failed to import and sign transaction';
      if (err instanceof Error) {
        errorMessage = err.message;

        // Check for common Soroban errors
        if (err.message.includes('simulation failed')) {
          errorMessage = `Simulation failed: ${err.message}. Check that you have enough FP and the game parameters are correct.`;
        } else if (err.message.includes('transaction failed')) {
          errorMessage = `Transaction failed: ${err.message}. The game could not be created on the blockchain.`;
        }
      }

      setError(errorMessage);

      // Keep the component in 'create' phase so user can see the error and retry
      // Don't change gamePhase or clear any fields - let the user see what went wrong
    } finally {
      setLoading(false);
    }
  };

  const handleLoadExistingGame = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const parsedSessionId = parseInt(loadSessionId.trim());
      if (isNaN(parsedSessionId) || parsedSessionId <= 0) {
        throw new Error('Enter a valid session ID');
      }

      // Try to load the game (use cache to prevent duplicate calls)
      const game = await requestCache.dedupe(
        createCacheKey('game-state', parsedSessionId),
        () => numberGuessService.getGame(parsedSessionId),
        5000
      );

      // Verify game exists and user is one of the players
      if (!game) {
        throw new Error('Game not found');
      }

      if (game.player1 !== userAddress && game.player2 !== userAddress) {
        throw new Error('You are not a player in this game');
      }

      // Load successful - update session ID and transition to game
      setSessionId(parsedSessionId);
      setGameState(game);
      setLoadSessionId('');

      // Determine game phase based on game state
      if (game.winner !== null && game.winner !== undefined) {
        // Game is complete - show reveal phase with winner
        setGamePhase('reveal');
        const isWinner = game.winner === userAddress;
        setSuccess(isWinner ? '🎉 You won this game!' : 'Game complete. Winner revealed.');
      } else if (game.player1_guess !== null && game.player1_guess !== undefined &&
          game.player2_guess !== null && game.player2_guess !== undefined) {
        // Both players guessed, waiting for reveal
        setGamePhase('reveal');
        setSuccess('Game loaded! Both players have guessed. You can reveal the winner.');
      } else {
        // Still in guessing phase
        setGamePhase('guess');
        setSuccess('Game loaded! Make your guess.');
      }

      // Clear success message after 2 seconds
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error('Load game error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load game');
    } finally {
      setLoading(false);
    }
  };

  const copyAuthEntryToClipboard = async () => {
    if (exportedAuthEntryXDR) {
      try {
        await navigator.clipboard.writeText(exportedAuthEntryXDR);
        setAuthEntryCopied(true);
        setTimeout(() => setAuthEntryCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy auth entry XDR:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const copyShareGameUrlWithAuthEntry = async () => {
    if (exportedAuthEntryXDR) {
      try {
        // Build URL with only Player 1's info and auth entry
        // Player 2 will specify their own wager when they import
        const params = new URLSearchParams({
          'game': 'number-guess',
          'auth': exportedAuthEntryXDR,
        });

        const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareUrlCopied(true);
        setTimeout(() => setShareUrlCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy share URL:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const copyShareGameUrlWithSessionId = async () => {
    if (loadSessionId) {
      try {
        const shareUrl = `${window.location.origin}${window.location.pathname}?game=number-guess&session-id=${loadSessionId}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareUrlCopied(true);
        setTimeout(() => setShareUrlCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy share URL:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const handleMakeGuess = async () => {
    if (guess === null) {
      setError('Select a number to guess');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const signer = getContractSigner();
      await numberGuessService.makeGuess(sessionId, userAddress, guess, signer);

      setSuccess(`Guess submitted: ${guess}`);
      await loadGameState();
    } catch (err) {
      console.error('Make guess error:', err);
      setError(err instanceof Error ? err.message : 'Failed to make guess');
    } finally {
      setLoading(false);
    }
  };

  const handleRevealWinner = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const signer = getContractSigner();
      const winnerResult = await numberGuessService.revealWinner(sessionId, userAddress, signer);

      // Reload game state to get the winner
      await loadGameState();

      // Show success message (will be shown along with winner display)
      const winner = (winnerResult as any).unwrap ? (winnerResult as any).unwrap() : winnerResult;
      const isWinner = winner === userAddress;
      setSuccess(isWinner ? '🎉 You won!' : 'Game complete! Winner revealed.');

      // Refresh faction standings immediately (without navigating away)
      onStandingsRefresh();

      // DON'T call onGameComplete() immediately - let user see the results
      // User can click "Back to Games" button when ready
    } catch (err) {
      console.error('Reveal winner error:', err);
      setError(err instanceof Error ? err.message : 'Failed to reveal winner');
    } finally {
      setLoading(false);
    }
  };

  const isPlayer1 = gameState && gameState.player1 === userAddress;
  const isPlayer2 = gameState && gameState.player2 === userAddress;
  const hasGuessed = isPlayer1 ? gameState?.player1_guess !== null && gameState?.player1_guess !== undefined :
                     isPlayer2 ? gameState?.player2_guess !== null && gameState?.player2_guess !== undefined : false;

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border-2 border-purple-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 bg-clip-text text-transparent">
            Number Guess Game 🎲
          </h2>
          <p className="text-sm text-gray-700 font-semibold mt-1">
            Guess a number 1-10. Closest guess wins!
          </p>
          <p className="text-xs text-gray-500 font-mono mt-1">
            Session ID: {sessionId}
          </p>
        </div>
        <button
          onClick={() => {
            // If game is complete (has winner), refresh stats before going back
            if (gameState?.winner) {
              onGameComplete();
            } else {
              onBack();
            }
          }}
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-gray-200 to-gray-300 hover:from-gray-300 hover:to-gray-400 transition-all text-sm font-bold shadow-md hover:shadow-lg transform hover:scale-105"
        >
          ← Back to Games
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
          <p className="text-sm font-semibold text-green-700">{success}</p>
        </div>
      )}

      {/* CREATE GAME PHASE */}
      {gamePhase === 'create' && (
        <div className="space-y-6">
          {/* Mode Toggle */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 p-2 bg-gray-100 rounded-xl">
            <button
              onClick={() => {
                setCreateMode('create');
                setExportedAuthEntryXDR(null);
                setImportAuthEntryXDR('');
                setImportSessionId('');
                setImportPlayer1('');
                setImportPlayer1Wager('');
                setImportPlayer2Wager('');
                setLoadSessionId('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'create'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Create & Export
            </button>
            <button
              onClick={() => {
                setCreateMode('import');
                setExportedAuthEntryXDR(null);
                setLoadSessionId('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'import'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Import Auth Entry
            </button>
            <button
              onClick={() => {
                setCreateMode('load');
                setExportedAuthEntryXDR(null);
                setImportAuthEntryXDR('');
                setImportSessionId('');
                setImportPlayer1('');
                setImportPlayer1Wager('');
                setImportPlayer2Wager('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'load'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Load Existing Game
            </button>
          </div>

          {createMode === 'create' ? (
            <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Your Address (Player 1)
              </label>
              <input
                type="text"
                value={userAddress.slice(0, 8) + '...' + userAddress.slice(-4)}
                disabled
                className="w-full px-4 py-3 rounded-xl bg-gray-100 border-2 border-gray-200 text-sm font-medium text-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Your Wager (FP)
              </label>
              <input
                type="text"
                value={player1Wager}
                onChange={(e) => setPlayer1Wager(e.target.value)}
                placeholder="0.1"
                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 text-sm font-medium"
              />
              <p className="text-xs font-semibold text-gray-600 mt-1">
                Available: {(Number(availableFP) / 10000000).toFixed(2)} FP
              </p>
            </div>

            <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <p className="text-xs font-semibold text-blue-800">
                ℹ️ Player 2 will specify their own address and wager when they import your auth entry. You only need to prepare and export your signature.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t-2 border-gray-100 space-y-4">
            <p className="text-xs font-semibold text-gray-600">
              Session ID: {sessionId}
            </p>

            {!exportedAuthEntryXDR ? (
              <button
                onClick={handlePrepareTransaction}
                disabled={loading}
                className="w-full py-4 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
              >
                {loading ? 'Preparing...' : 'Prepare & Export Auth Entry'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                  <p className="text-xs font-bold uppercase tracking-wide text-green-700 mb-2">
                    Auth Entry XDR (Player 1 Signed)
                  </p>
                  <div className="bg-white p-3 rounded-lg border border-green-200 mb-3">
                    <code className="text-xs font-mono text-gray-700 break-all">
                      {exportedAuthEntryXDR}
                    </code>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={copyAuthEntryToClipboard}
                      className="py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold text-sm transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                    >
                      {authEntryCopied ? '✓ Copied!' : '📋 Copy Auth Entry'}
                    </button>
                    <button
                      onClick={copyShareGameUrlWithAuthEntry}
                      className="py-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-sm transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                    >
                      {shareUrlCopied ? '✓ Copied!' : '🔗 Share URL'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-600 text-center font-semibold">
                  Copy the auth entry XDR or share URL with Player 2 to complete the transaction
                </p>
              </div>
            )}
          </div>
            </div>
          ) : createMode === 'import' ? (
            /* IMPORT MODE */
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
                <p className="text-sm font-semibold text-blue-800 mb-2">
                  📥 Import Auth Entry from Player 1
                </p>
                <p className="text-xs text-gray-700 mb-4">
                  Paste the auth entry XDR from Player 1. Session ID, Player 1 address, and their wager will be auto-extracted. You only need to enter your wager amount.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Auth Entry XDR</label>
                    <textarea
                      value={importAuthEntryXDR}
                      onChange={(e) => {
                        const authEntryXdr = e.target.value;
                        setImportAuthEntryXDR(authEntryXdr);

                        // Try to parse and auto-fill when auth entry is pasted
                        if (authEntryXdr.trim().length > 50) {
                          try {
                            const parsed = numberGuessService.parseAuthEntry(authEntryXdr.trim());
                            // Auto-populate the read-only fields
                            setImportSessionId(parsed.sessionId.toString());
                            setImportPlayer1(parsed.player1);
                            setImportPlayer1Wager((Number(parsed.player1Wager) / 10_000_000).toString());
                            // Prefill Player 2 wager with default 0.1
                            setImportPlayer2Wager('0.1');
                            console.log('✅ Auto-filled from auth entry:', parsed);
                          } catch (err: any) {
                            // Clear fields if parsing fails
                            setImportSessionId('');
                            setImportPlayer1('');
                            setImportPlayer1Wager('');
                            console.log('⚠️ Unable to parse auth entry (will retry on import):', err.message);
                          }
                        } else {
                          // Clear fields if auth entry is too short
                          setImportSessionId('');
                          setImportPlayer1('');
                          setImportPlayer1Wager('');
                        }
                      }}
                      placeholder="Paste Player 1's signed auth entry XDR here..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl bg-white border-2 border-blue-200 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 text-xs font-mono resize-none"
                    />
                  </div>
                  {/* Auto-populated fields from auth entry (read-only) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Session ID (auto-filled)</label>
                      <input
                        type="text"
                        value={importSessionId}
                        readOnly
                        placeholder="Auto-filled from auth entry"
                        className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs font-mono text-gray-600 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Player 1 Wager (auto-filled)</label>
                      <input
                        type="text"
                        value={importPlayer1Wager}
                        readOnly
                        placeholder="Auto-filled from auth entry"
                        className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs text-gray-600 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Player 1 Address (auto-filled)</label>
                    <input
                      type="text"
                      value={importPlayer1}
                      readOnly
                      placeholder="Auto-filled from auth entry"
                      className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs font-mono text-gray-600 cursor-not-allowed"
                    />
                  </div>
                  {/* User inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Player 2 (You)</label>
                      <input
                        type="text"
                        value={userAddress}
                        readOnly
                        className="w-full px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200 text-xs font-mono text-gray-600 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Your Wager (FP) *</label>
                      <input
                        type="text"
                        value={importPlayer2Wager}
                        onChange={(e) => setImportPlayer2Wager(e.target.value)}
                        placeholder="e.g., 0.1"
                        className="w-full px-4 py-2 rounded-xl bg-white border-2 border-blue-200 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleImportTransaction}
                disabled={loading || !importAuthEntryXDR.trim() || !importPlayer2Wager.trim()}
                className="w-full py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 hover:from-blue-600 hover:via-cyan-600 hover:to-teal-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
              >
                {loading ? 'Importing & Signing...' : 'Import & Sign Auth Entry'}
              </button>
            </div>
          ) : createMode === 'load' ? (
            /* LOAD EXISTING GAME MODE */
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                <p className="text-sm font-semibold text-green-800 mb-2">
                  🎮 Load Existing Game by Session ID
                </p>
                <p className="text-xs text-gray-700 mb-4">
                  Enter a session ID to load and continue an existing game. You must be one of the players.
                </p>
                <input
                  type="text"
                  value={loadSessionId}
                  onChange={(e) => setLoadSessionId(e.target.value)}
                  placeholder="Enter session ID (e.g., 123456789)"
                  className="w-full px-4 py-3 rounded-xl bg-white border-2 border-green-200 focus:outline-none focus:border-green-400 focus:ring-4 focus:ring-green-100 text-sm font-mono"
                />
              </div>

              <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-xl">
                <p className="text-xs font-bold text-yellow-800 mb-2">
                  Requirements
                </p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                  <li>You must be Player 1 or Player 2 in the game</li>
                  <li>Game must be active (not completed)</li>
                  <li>Valid session ID from an existing game</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleLoadExistingGame}
                  disabled={loading || !loadSessionId.trim()}
                  className="py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 hover:from-green-600 hover:via-emerald-600 hover:to-teal-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
                >
                  {loading ? 'Loading...' : '🎮 Load Game'}
                </button>
                <button
                  onClick={copyShareGameUrlWithSessionId}
                  disabled={!loadSessionId.trim()}
                  className="py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
                >
                  {shareUrlCopied ? '✓ Copied!' : '🔗 Share Game'}
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center font-semibold">
                Load the game to continue playing, or share the URL with another player
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* GUESS PHASE */}
      {gamePhase === 'guess' && gameState && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-5 rounded-xl border-2 ${isPlayer1 ? 'border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg' : 'border-gray-200 bg-white'}`}>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Player 1</div>
              <div className="font-mono text-sm font-semibold mb-2 text-gray-800">
                {gameState.player1.slice(0, 8)}...{gameState.player1.slice(-4)}
              </div>
              <div className="text-xs font-semibold text-gray-600">
                Wager: {(Number(gameState.player1_wager) / 10000000).toFixed(2)} FP
              </div>
              <div className="mt-3">
                {gameState.player1_guess !== null && gameState.player1_guess !== undefined ? (
                  <div className="inline-block px-3 py-1 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 text-white text-xs font-bold shadow-md">
                    ✓ Guessed
                  </div>
                ) : (
                  <div className="inline-block px-3 py-1 rounded-full bg-gray-200 text-gray-600 text-xs font-bold">
                    Waiting...
                  </div>
                )}
              </div>
            </div>

            <div className={`p-5 rounded-xl border-2 ${isPlayer2 ? 'border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg' : 'border-gray-200 bg-white'}`}>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">Player 2</div>
              <div className="font-mono text-sm font-semibold mb-2 text-gray-800">
                {gameState.player2.slice(0, 8)}...{gameState.player2.slice(-4)}
              </div>
              <div className="text-xs font-semibold text-gray-600">
                Wager: {(Number(gameState.player2_wager) / 10000000).toFixed(2)} FP
              </div>
              <div className="mt-3">
                {gameState.player2_guess !== null && gameState.player2_guess !== undefined ? (
                  <div className="inline-block px-3 py-1 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 text-white text-xs font-bold shadow-md">
                    ✓ Guessed
                  </div>
                ) : (
                  <div className="inline-block px-3 py-1 rounded-full bg-gray-200 text-gray-600 text-xs font-bold">
                    Waiting...
                  </div>
                )}
              </div>
            </div>
          </div>

          {(isPlayer1 || isPlayer2) && !hasGuessed && (
            <div className="space-y-4">
              <label className="block text-sm font-bold text-gray-700">
                Make Your Guess (1-10)
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => setGuess(num)}
                    className={`p-4 rounded-xl border-2 font-black text-xl transition-all ${
                      guess === num
                        ? 'border-purple-500 bg-gradient-to-br from-purple-500 to-pink-500 text-white scale-110 shadow-2xl'
                        : 'border-gray-200 bg-white hover:border-purple-300 hover:shadow-lg hover:scale-105'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <button
                onClick={handleMakeGuess}
                disabled={loading || guess === null}
                className="w-full py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 hover:from-purple-600 hover:via-pink-600 hover:to-red-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
              >
                {loading ? 'Submitting...' : 'Submit Guess'}
              </button>
            </div>
          )}

          {hasGuessed && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
              <p className="text-sm font-semibold text-blue-700">
                ✓ You've made your guess. Waiting for other player...
              </p>
            </div>
          )}
        </div>
      )}

      {/* REVEAL PHASE */}
      {gamePhase === 'reveal' && gameState && (
        <div className="space-y-6">
          <div className="p-8 bg-gradient-to-br from-yellow-50 via-orange-50 to-amber-50 border-2 border-yellow-300 rounded-2xl text-center shadow-xl">
            <div className="text-6xl mb-4">🎊</div>
            <h3 className="text-2xl font-black text-gray-900 mb-3">
              Both Players Have Guessed!
            </h3>
            <p className="text-sm font-semibold text-gray-700 mb-6">
              Click below to reveal the winner
            </p>
            <button
              onClick={handleRevealWinner}
              disabled={loading}
              className="px-10 py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-yellow-500 via-orange-500 to-amber-500 hover:from-yellow-600 hover:via-orange-600 hover:to-amber-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
            >
              {loading ? 'Revealing...' : 'Reveal Winner'}
            </button>
          </div>
        </div>
      )}

      {/* COMPLETE PHASE */}
      {gamePhase === 'complete' && gameState && (
        <div className="space-y-6">
          <div className="p-10 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-2 border-green-300 rounded-2xl text-center shadow-2xl">
            <div className="text-7xl mb-6">🏆</div>
            <h3 className="text-3xl font-black text-gray-900 mb-4">
              Game Complete!
            </h3>
            <div className="text-2xl font-black text-green-700 mb-6">
              Winning Number: {gameState.winning_number}
            </div>
            <div className="space-y-2 mb-6">
              <p className="text-sm font-semibold text-gray-700">
                Player 1 Guess: {gameState.player1_guess}
              </p>
              <p className="text-sm font-semibold text-gray-700">
                Player 2 Guess: {gameState.player2_guess}
              </p>
            </div>
            {gameState.winner && (
              <div className="mt-6 p-5 bg-white border-2 border-green-200 rounded-xl shadow-lg">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-2">Winner</p>
                <p className="font-mono text-sm font-bold text-gray-800">
                  {gameState.winner.slice(0, 8)}...{gameState.winner.slice(-4)}
                </p>
                {gameState.winner === userAddress && (
                  <p className="mt-3 text-green-700 font-black text-lg">
                    🎉 You won!
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onBack}
            className="w-full py-4 rounded-xl font-bold text-gray-700 bg-gradient-to-r from-gray-200 to-gray-300 hover:from-gray-300 hover:to-gray-400 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Back to Games
          </button>
        </div>
      )}
    </div>
  );
}
