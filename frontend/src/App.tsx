import { useWallet } from '@/hooks/useWallet';
import { Dashboard } from '@/components/Dashboard';
import { Wallet, TestTube, AlertCircle } from 'lucide-react';

function WalletSelection() {
  const { connect, connectDev, isConnecting, error, isDevModeAvailable, isDevPlayerAvailable } =
    useWallet();

  const handleWalletConnect = async () => {
    try {
      await connect();
    } catch (err) {
      // Error is already set in the store
      console.error('Connection failed:', err);
    }
  };

  const handleDevConnect = async (playerNumber: 1 | 2) => {
    try {
      await connectDev(playerNumber);
    } catch (err) {
      console.error('Dev connection failed:', err);
    }
  };

  const showDevMode = isDevModeAvailable();
  const player1Available = isDevPlayerAvailable(1);
  const player2Available = isDevPlayerAvailable(2);

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

        {/* Wallet Connection Section */}
        <div className="mb-10">
          <h2 className="text-2xl font-black text-gray-900 mb-3 text-center">Connect Your Wallet</h2>
          <p className="text-sm font-semibold text-gray-600 text-center mb-8">
            Connect with any Stellar wallet to start playing
          </p>

          <div className="flex justify-center">
            <button
              onClick={handleWalletConnect}
              disabled={isConnecting}
              className="px-8 py-6 rounded-2xl border-2 border-blue-200 hover:border-blue-400 bg-gradient-to-br from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-4">
                <Wallet className="w-8 h-8 text-blue-600" />
                <div className="text-left">
                  <h3 className="font-black text-xl text-gray-900">
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </h3>
                  <div className="text-xs font-semibold text-gray-600">
                    Freighter, xBull, Albedo, and more
                  </div>
                </div>
              </div>
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border-2 border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-semibold">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Dev Mode Section (if available) */}
        {showDevMode && (
          <>
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-gray-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-white/70 text-sm font-black text-gray-500 uppercase tracking-wide">
                  Or use Dev Mode
                </span>
              </div>
            </div>

            <div className="mb-10">
              <h2 className="text-2xl font-black text-gray-900 mb-3 text-center flex items-center justify-center gap-2">
                <TestTube className="w-6 h-6 text-purple-600" />
                Developer Test Accounts
              </h2>
              <p className="text-sm font-semibold text-gray-600 text-center mb-8">
                Use pre-configured test wallets for development
              </p>

              <div
                className={`grid gap-6 ${player1Available && player2Available ? 'grid-cols-2' : 'grid-cols-1 max-w-md mx-auto'}`}
              >
                {player1Available && (
                  <button
                    onClick={() => handleDevConnect(1)}
                    disabled={isConnecting}
                    className="p-8 rounded-2xl border-2 border-purple-200 hover:border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-5xl mb-4">👤</div>
                    <h3 className="font-black text-xl text-gray-900 mb-2">Player 1</h3>
                    <div className="text-xs font-semibold text-gray-600">Dev Test Account</div>
                  </button>
                )}

                {player2Available && (
                  <button
                    onClick={() => handleDevConnect(2)}
                    disabled={isConnecting}
                    className="p-8 rounded-2xl border-2 border-purple-200 hover:border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-5xl mb-4">👥</div>
                    <h3 className="font-black text-xl text-gray-900 mb-2">Player 2</h3>
                    <div className="text-xs font-semibold text-gray-600">Dev Test Account</div>
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* How to Play Section */}
        <div className="pt-8 border-t-2 border-gray-200">
          <h3 className="text-sm font-black uppercase tracking-wide text-gray-900 mb-4">
            How to Play
          </h3>
          <div className="space-y-3 text-sm font-semibold text-gray-700">
            <div className="flex items-start gap-3 bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded-xl">
              <span className="text-blue-600 font-black">1.</span>
              <span>Connect your wallet or select a dev player</span>
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
  const { isConnected, disconnect } = useWallet();

  if (!isConnected) {
    return <WalletSelection />;
  }

  return <Dashboard onLogout={disconnect} />;
}

export default App;
