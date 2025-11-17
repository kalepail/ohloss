import { useState } from 'react';
import { NumberGuessGame } from './NumberGuessGame';
import { GAME_CONTRACT } from '@/utils/constants';

interface GamesCatalogProps {
  userAddress: string;
  currentEpoch: number;
  availableFP: bigint;
  onGameComplete: () => void;
  onGameActiveChange?: (isActive: boolean) => void;
}

const AVAILABLE_GAMES = [
  {
    id: 'number-guess',
    name: 'Number Guess',
    emoji: '🎲',
    description: 'Guess a number between 1-10. Closest guess wins!',
    minPlayers: 2,
    maxPlayers: 2,
    minWager: 1000000n, // 0.1 USDC in stroops
    color: 'from-purple-500 to-pink-500',
    contractAddress: GAME_CONTRACT,
  },
];

export function GamesCatalog({ userAddress, currentEpoch, availableFP, onGameComplete, onGameActiveChange }: GamesCatalogProps) {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  const handleSelectGame = (gameId: string) => {
    console.log('Game selected:', gameId);
    setSelectedGame(gameId);
    onGameActiveChange?.(true);
  };

  const handleBackToGames = () => {
    setSelectedGame(null);
    onGameActiveChange?.(false);
  };

  if (selectedGame) {
    const game = AVAILABLE_GAMES.find(g => g.id === selectedGame);
    if (!game) return null;

    if (game.id === 'number-guess') {
      return (
        <NumberGuessGame
          userAddress={userAddress}
          currentEpoch={currentEpoch}
          availableFP={availableFP}
          onBack={handleBackToGames}
          onGameComplete={() => {
            handleBackToGames();
            onGameComplete();
          }}
        />
      );
    }
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border-2 border-blue-200">
      <h2 className="text-3xl font-black text-gray-900 mb-2">
        Games Library
      </h2>
      <p className="text-gray-700 font-semibold mb-6">
        Choose a game to play and wager your Faction Points
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {AVAILABLE_GAMES.map((game) => (
          <div
            key={game.id}
            className="relative group cursor-pointer"
            onClick={() => handleSelectGame(game.id)}
          >
            <div className="bg-white rounded-2xl p-6 border-2 border-purple-200 hover:border-purple-400 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl">
              <div className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-0 group-hover:opacity-15 rounded-2xl transition-opacity duration-300 pointer-events-none`}></div>

              <div className="relative z-10">
                <div className="text-6xl mb-4">{game.emoji}</div>
                <h3 className={`text-2xl font-black mb-3 bg-gradient-to-r ${game.color} bg-clip-text text-transparent`}>
                  {game.name}
                </h3>
                <p className="text-sm text-gray-700 font-medium mb-4">
                  {game.description}
                </p>

                <div className="space-y-2 text-xs font-semibold text-gray-600">
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                    <span>Players:</span>
                    <span className="text-purple-600">{game.minPlayers}-{game.maxPlayers}</span>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                    <span>Min Wager:</span>
                    <span className="text-purple-600">{(Number(game.minWager) / 10000000).toFixed(2)} FP</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t-2 border-gray-100">
                  <div className={`w-full py-3 rounded-xl bg-gradient-to-r ${game.color} text-white font-bold text-sm shadow-lg hover:shadow-xl transition-all text-center`}>
                    Play Now
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Coming Soon Placeholder */}
        <div className="bg-white/50 rounded-2xl p-6 border-2 border-dashed border-gray-300 opacity-60">
          <div className="text-6xl mb-4">🎮</div>
          <h3 className="text-2xl font-bold mb-3 text-gray-500">
            More Games
          </h3>
          <p className="text-sm text-gray-600 font-medium mb-4">
            Additional games coming soon!
          </p>
          <div className="text-xs text-gray-500 font-semibold">
            Stay tuned for new challenges
          </div>
        </div>
      </div>
    </div>
  );
}
