import { useState } from 'react';
import { TwentyOneGame } from '../games/twenty-one/TwentyOneGame';
import { NumberGuessGame } from '../games/number-guess/NumberGuessGame';
import { useWallet } from '@/hooks/useWallet';
import './GamesCatalog.css';

export function GamesCatalog() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const { publicKey, isConnected, isConnecting, error } = useWallet();

  const userAddress = publicKey ?? '';

  const handleSelectGame = (gameId: string) => {
    setSelectedGame(gameId);
  };

  const handleBackToGames = () => {
    setSelectedGame(null);
  };

  if (selectedGame === 'twenty-one') {
    return (
      <TwentyOneGame
        userAddress={userAddress}
        currentEpoch={1}
        availableFP={1000000000n}
        onBack={handleBackToGames}
        onStandingsRefresh={() => console.log('Refresh standings')}
        onGameComplete={() => console.log('Game complete')}
      />
    );
  }

  if (selectedGame === 'number-guess') {
    return (
      <NumberGuessGame
        userAddress={userAddress}
        currentEpoch={1}
        availableFP={1000000000n}
        onBack={handleBackToGames}
        onStandingsRefresh={() => console.log('Refresh standings')}
        onGameComplete={() => console.log('Game complete')}
      />
    );
  }

  // Show the games catalog
  return (
    <div className="games-catalog">
      <div className="catalog-header">
        <h2 className="catalog-title gradient-text">
          Games Library
        </h2>
        <p className="catalog-description">
          Choose a game to play or build your own Blendizzard game
        </p>
      </div>

      {!isConnected && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          {error ? (
            <>
              <h3 className="gradient-text">Wallet Connection Error</h3>
              <p style={{ color: '#4b5563', marginTop: '0.75rem' }}>{error}</p>
            </>
          ) : (
            <>
              <h3 className="gradient-text">{isConnecting ? 'Connecting…' : 'Connect Wallet'}</h3>
              <p style={{ color: '#4b5563', marginTop: '0.75rem' }}>
                Connect a dev wallet from the header to play games.
              </p>
            </>
          )}
        </div>
      )}

      <div className="games-grid">
        {/* Twenty-One Card */}
        <div
          className="game-card-wrapper"
          onClick={() => isConnected && handleSelectGame('twenty-one')}
        >
          <div className="game-card">
            <div className="game-card-gradient"></div>

            <div className="game-card-content">
              <div className="game-emoji">🃏</div>
              <h3 className="game-title">
                TWENTY-ONE
              </h3>
              <p className="game-description">
                Get as close to 21 as you can without going over in this classic card game
              </p>

              <div className="game-details">
                <div className="game-detail-item">
                  <span className="detail-label">Players:</span>
                  <span className="detail-value">2</span>
                </div>
                <div className="game-detail-item">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">Card Game</span>
                </div>
              </div>

              <div className="game-card-footer">
                <div className="play-button">
                  Play Now
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Number Guess Card */}
        <div
          className="game-card-wrapper"
          onClick={() => isConnected && handleSelectGame('number-guess')}
        >
          <div className="game-card">
            <div className="game-card-gradient"></div>

            <div className="game-card-content">
              <div className="game-emoji">🎯</div>
              <h3 className="game-title">
                NUMBER GUESS
              </h3>
              <p className="game-description">
                Guess a number between 1-10. Closest guess to the random number wins!
              </p>

              <div className="game-details">
                <div className="game-detail-item">
                  <span className="detail-label">Players:</span>
                  <span className="detail-value">2</span>
                </div>
                <div className="game-detail-item">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">Guessing Game</span>
                </div>
              </div>

              <div className="game-card-footer">
                <div className="play-button">
                  Play Now
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
