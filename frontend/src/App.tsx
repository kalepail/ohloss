import { useState } from 'react';
import { devWalletService } from '@/services/devWalletService';
import { Dashboard } from '@/components/Dashboard';

function PlayerSelection({ onSelectPlayer }: { onSelectPlayer: (player: 1 | 2) => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>

      <div className="relative bg-white/70 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border-2 border-white/60 max-w-3xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
            Welcome to Blendizzard
          </h1>
          <p className="text-gray-700 font-semibold text-lg">
            Faction-based competitive gaming on Stellar Soroban
          </p>
        </div>

        <div className="mb-10">
          <h2 className="text-2xl font-black text-gray-900 mb-3 text-center">
            Select Dev Player
          </h2>
          <p className="text-sm font-semibold text-gray-600 text-center mb-8">
            Choose a test player to start playing
          </p>

          <div className="grid grid-cols-2 gap-6">
            <button
              onClick={() => {
                devWalletService.initPlayer(1);
                onSelectPlayer(1);
              }}
              className="p-8 rounded-2xl border-2 border-blue-200 hover:border-blue-400 bg-gradient-to-br from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl"
            >
              <div className="text-5xl mb-4">👤</div>
              <h3 className="font-black text-xl text-gray-900 mb-2">
                Player 1
              </h3>
              <div className="text-xs font-semibold text-gray-600">
                Dev Test Account
              </div>
            </button>

            <button
              onClick={() => {
                devWalletService.initPlayer(2);
                onSelectPlayer(2);
              }}
              className="p-8 rounded-2xl border-2 border-purple-200 hover:border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl"
            >
              <div className="text-5xl mb-4">👥</div>
              <h3 className="font-black text-xl text-gray-900 mb-2">
                Player 2
              </h3>
              <div className="text-xs font-semibold text-gray-600">
                Dev Test Account
              </div>
            </button>
          </div>
        </div>

        <div className="pt-8 border-t-2 border-gray-200">
          <h3 className="text-sm font-black uppercase tracking-wide text-gray-900 mb-4">
            How to Play
          </h3>
          <div className="space-y-3 text-sm font-semibold text-gray-700">
            <div className="flex items-start gap-3 bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded-xl">
              <span className="text-blue-600 font-black">1.</span>
              <span>Select a player to login with dev wallet</span>
            </div>
            <div className="flex items-start gap-3 bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded-xl">
              <span className="text-purple-600 font-black">2.</span>
              <span>Choose your faction (WholeNoodle, PointyStick, or SpecialRock)</span>
            </div>
            <div className="flex items-start gap-3 bg-gradient-to-r from-pink-50 to-red-50 p-3 rounded-xl">
              <span className="text-pink-600 font-black">3.</span>
              <span>Deposit USDC to the vault to earn Faction Points</span>
            </div>
            <div className="flex items-start gap-3 bg-gradient-to-r from-blue-50 to-cyan-50 p-3 rounded-xl">
              <span className="text-cyan-600 font-black">4.</span>
              <span>Play games and compete for yield rewards each epoch</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2 | null>(null);

  const handleLogout = () => {
    setSelectedPlayer(null);
  };

  if (selectedPlayer === null) {
    return <PlayerSelection onSelectPlayer={setSelectedPlayer} />;
  }

  return <Dashboard playerNumber={selectedPlayer} onLogout={handleLogout} />;
}

export default App;
