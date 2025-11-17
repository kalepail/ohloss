import { useState, useEffect } from 'react';
import { numberGuessService } from '@/services/numberGuessService';
import { devWalletService } from '@/services/devWalletService';
import type { Game } from '../../../bunt/bindings/number-guess/dist/index';

interface NumberGuessGameProps {
  userAddress: string;
  currentEpoch: number;
  availableFP: bigint;
  onBack: () => void;
  onGameComplete: () => void;
}

export function NumberGuessGame({
  userAddress,
  availableFP,
  onBack,
  onGameComplete
}: NumberGuessGameProps) {
  // Use a session ID that fits in u32 (max 4,294,967,295)
  // Take the last 9 digits of the timestamp to ensure uniqueness while fitting in u32
  const [sessionId, setSessionId] = useState<number>(() => Math.floor(Date.now() / 1000) % 1000000000);
  const [player2Address, setPlayer2Address] = useState('');
  const [player1Wager, setPlayer1Wager] = useState('0.1');
  const [player2Wager, setPlayer2Wager] = useState('0.1');
  const [guess, setGuess] = useState<number | null>(null);
  const [gameState, setGameState] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [gamePhase, setGamePhase] = useState<'create' | 'guess' | 'reveal' | 'complete'>('create');
  const [createMode, setCreateMode] = useState<'create' | 'import'>('create');
  const [exportedXDR, setExportedXDR] = useState<string | null>(null);
  const [importXDR, setImportXDR] = useState('');

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
      const game = await numberGuessService.getGame(sessionId);
      setGameState(game);

      // Determine game phase based on state
      if (game.winner !== null && game.winner !== undefined) {
        setGamePhase('complete');
      } else if (game.player1_guess !== null && game.player1_guess !== undefined &&
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

  const handleCreateGame = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const p1Wager = parseWager(player1Wager);
      const p2Wager = parseWager(player2Wager);

      if (!p1Wager || p1Wager <= 0n) {
        throw new Error('Enter a valid Player 1 wager');
      }
      if (!p2Wager || p2Wager <= 0n) {
        throw new Error('Enter a valid Player 2 wager');
      }
      if (!player2Address) {
        throw new Error('Enter Player 2 address');
      }

      const signer = devWalletService.getSigner();
      await numberGuessService.startGame(
        sessionId,
        userAddress,
        player2Address,
        p1Wager,
        p2Wager,
        signer
      );

      setSuccess('Game created successfully!');
      setGamePhase('guess');
      await loadGameState();
    } catch (err) {
      console.error('Create game error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  const handlePrepareTransaction = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const p1Wager = parseWager(player1Wager);
      const p2Wager = parseWager(player2Wager);

      if (!p1Wager || p1Wager <= 0n) {
        throw new Error('Enter a valid Player 1 wager');
      }
      if (!p2Wager || p2Wager <= 0n) {
        throw new Error('Enter a valid Player 2 wager');
      }
      if (!player2Address) {
        throw new Error('Enter Player 2 address');
      }

      const signer = devWalletService.getSigner();
      const xdr = await numberGuessService.prepareStartGame(
        sessionId,
        userAddress,
        player2Address,
        p1Wager,
        p2Wager,
        signer
      );

      setExportedXDR(xdr);
      setSuccess('Transaction prepared! Copy the XDR below and send it to Player 2.');
    } catch (err) {
      console.error('Prepare transaction error:', err);
      setError(err instanceof Error ? err.message : 'Failed to prepare transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleImportTransaction = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!importXDR.trim()) {
        throw new Error('Enter transaction XDR');
      }

      const signer = devWalletService.getSigner();
      await numberGuessService.importAndCompleteStartGame(
        importXDR.trim(),
        userAddress,
        signer
      );

      setSuccess('Game created successfully!');
      setGamePhase('guess');
      setImportXDR('');
      await loadGameState();
    } catch (err) {
      console.error('Import transaction error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import and sign transaction');
    } finally {
      setLoading(false);
    }
  };

  const copyXDRToClipboard = async () => {
    if (exportedXDR) {
      try {
        await navigator.clipboard.writeText(exportedXDR);
        setSuccess('XDR copied to clipboard! Send it to Player 2.');
      } catch (err) {
        console.error('Failed to copy XDR:', err);
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

      const signer = devWalletService.getSigner();
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

      const signer = devWalletService.getSigner();
      const winner = await numberGuessService.revealWinner(sessionId, userAddress, signer);

      setSuccess(`Winner: ${winner}`);
      await loadGameState();
      onGameComplete();
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
        </div>
        <button
          onClick={onBack}
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
          <div className="flex items-center justify-center gap-3 p-2 bg-gray-100 rounded-xl">
            <button
              onClick={() => {
                setCreateMode('create');
                setExportedXDR(null);
                setImportXDR('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'create'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Create & Export Transaction
            </button>
            <button
              onClick={() => {
                setCreateMode('import');
                setExportedXDR(null);
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                createMode === 'import'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Import Transaction
            </button>
          </div>

          {createMode === 'create' ? (
            <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Player 1 (You)
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
                Player 2 Address
              </label>
              <input
                type="text"
                value={player2Address}
                onChange={(e) => setPlayer2Address(e.target.value)}
                placeholder="GABC..."
                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 text-sm font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Player 2 Wager (FP)
              </label>
              <input
                type="text"
                value={player2Wager}
                onChange={(e) => setPlayer2Wager(e.target.value)}
                placeholder="0.1"
                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 text-sm font-medium"
              />
            </div>
          </div>

          <div className="pt-4 border-t-2 border-gray-100 space-y-4">
            <p className="text-xs font-semibold text-gray-600">
              Session ID: {sessionId}
            </p>

            {!exportedXDR ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handlePrepareTransaction}
                  disabled={loading}
                  className="py-4 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                >
                  {loading ? 'Preparing...' : 'Prepare & Export'}
                </button>
                <button
                  onClick={handleCreateGame}
                  disabled={loading}
                  className="py-4 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                >
                  {loading ? 'Creating...' : 'Create Directly'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                  <p className="text-xs font-bold uppercase tracking-wide text-green-700 mb-2">
                    Transaction XDR (Player 1 Signed)
                  </p>
                  <div className="bg-white p-3 rounded-lg border border-green-200 mb-3">
                    <code className="text-xs font-mono text-gray-700 break-all">
                      {exportedXDR}
                    </code>
                  </div>
                  <button
                    onClick={copyXDRToClipboard}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold text-sm transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    📋 Copy XDR to Clipboard
                  </button>
                </div>
                <p className="text-xs text-gray-600 text-center font-semibold">
                  Send this XDR to Player 2 to complete the transaction
                </p>
              </div>
            )}
          </div>
            </div>
          ) : (
            /* IMPORT MODE */
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
                <p className="text-sm font-semibold text-blue-800 mb-2">
                  📥 Import Transaction from Player 1
                </p>
                <p className="text-xs text-gray-700 mb-4">
                  Paste the transaction XDR from Player 1. You'll be able to review the details before signing.
                </p>
                <textarea
                  value={importXDR}
                  onChange={(e) => setImportXDR(e.target.value)}
                  placeholder="Paste transaction XDR here..."
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl bg-white border-2 border-blue-200 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 text-xs font-mono resize-none"
                />
              </div>

              <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-xl">
                <p className="text-xs font-bold text-yellow-800 mb-2">
                  Transaction Details
                </p>
                <p className="text-xs text-gray-700">
                  Session ID: {sessionId}
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  After importing, you'll sign and submit the transaction to start the game.
                </p>
              </div>

              <button
                onClick={handleImportTransaction}
                disabled={loading || !importXDR.trim()}
                className="w-full py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 hover:from-blue-600 hover:via-cyan-600 hover:to-teal-600 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none"
              >
                {loading ? 'Importing & Signing...' : 'Import & Sign Transaction'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* GUESS PHASE */}
      {gamePhase === 'guess' && gameState && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-5 gap-3">
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
