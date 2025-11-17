import { useState, useEffect } from 'react';
import { blendizzardService } from '@/services/blendizzardService';
import { devWalletService } from '@/services/devWalletService';

interface EpochTimerProps {
  currentEpoch: number;
  onEpochCycled?: () => void;
}

export function EpochTimer({ currentEpoch, onEpochCycled }: EpochTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('Loading...');
  const [epochEndTime, setEpochEndTime] = useState<number>(0);
  const [epochEnded, setEpochEnded] = useState(false);
  const [cycling, setCycling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadEpochData();
  }, [currentEpoch]);

  useEffect(() => {
    if (epochEndTime === 0) return;

    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = epochEndTime - now;

      if (remaining <= 0) {
        setTimeRemaining('Epoch Ended');
        setEpochEnded(true);
        clearInterval(timer);
        return;
      }

      setEpochEnded(false);
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [epochEndTime]);

  const loadEpochData = async () => {
    try {
      const epochInfo = await blendizzardService.getEpoch(currentEpoch);
      setEpochEndTime(Number(epochInfo.end_time));
    } catch (error) {
      console.error('Failed to load epoch data:', error);
    }
  };

  const handleCycleEpoch = async () => {
    try {
      setCycling(true);
      setError(null);
      setSuccess(null);

      const userAddress = devWalletService.getPublicKey();
      const signer = devWalletService.getSigner();

      const newEpoch = await blendizzardService.cycleEpoch(userAddress, signer);

      setSuccess(`Successfully cycled to Epoch #${newEpoch}!`);
      setEpochEnded(false);

      // Call parent callback to refresh dashboard
      if (onEpochCycled) {
        onEpochCycled();
      }
    } catch (err) {
      console.error('Cycle epoch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to cycle epoch');
    } finally {
      setCycling(false);
    }
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-blue-100 hover:shadow-xl transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${epochEnded ? 'bg-gradient-to-r from-red-400 to-orange-500 shadow-red-400/50' : 'bg-gradient-to-r from-green-400 to-emerald-500 animate-pulse shadow-green-400/50'}`}></div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-blue-600">
          Current Epoch
        </h3>
      </div>
      <div className="text-5xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
        #{currentEpoch}
      </div>
      <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 px-3 py-2 rounded-xl mb-3">
        <svg
          className="w-4 h-4 text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-sm font-bold text-gray-700">
          {timeRemaining}
        </span>
      </div>

      {epochEnded && (
        <button
          onClick={handleCycleEpoch}
          disabled={cycling}
          className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold text-sm disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
        >
          {cycling ? 'Cycling Epoch...' : 'Cycle Epoch'}
        </button>
      )}

      {error && (
        <div className="mt-3 p-3 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
          <p className="text-xs font-semibold text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-3 p-3 bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-300 rounded-xl">
          <p className="text-xs font-semibold text-green-800">{success}</p>
        </div>
      )}
    </div>
  );
}
