import { useState } from 'react';
import { blendizzardService } from '@/services/blendizzardService';
import { devWalletService } from '@/services/devWalletService';

interface FactionSelectionProps {
  userAddress: string;
  onSuccess: () => void;
}

const FACTIONS = [
  {
    id: 0,
    name: 'WholeNoodle',
    emoji: '🍜',
    description: 'Masters of flexibility and adaptability. Like a noodle, they bend but never break.',
    color: 'from-yellow-400 to-orange-500',
    bgColor: 'bg-gradient-to-br from-yellow-50 to-orange-50',
    borderColor: 'border-yellow-300',
  },
  {
    id: 1,
    name: 'PointyStick',
    emoji: '🗡️',
    description: 'Warriors of precision and strategy. Direct, sharp, and always on target.',
    color: 'from-blue-400 to-cyan-500',
    bgColor: 'bg-gradient-to-br from-blue-50 to-cyan-50',
    borderColor: 'border-blue-300',
  },
  {
    id: 2,
    name: 'SpecialRock',
    emoji: '🪨',
    description: 'Guardians of strength and resilience. Solid, dependable, and unshakeable.',
    color: 'from-gray-400 to-slate-500',
    bgColor: 'bg-gradient-to-br from-gray-50 to-slate-50',
    borderColor: 'border-gray-300',
  },
];

export function FactionSelection({ userAddress, onSuccess }: FactionSelectionProps) {
  const [selectedFaction, setSelectedFaction] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFaction = async () => {
    if (selectedFaction === null) return;

    try {
      setLoading(true);
      setError(null);

      const signer = devWalletService.getSigner();
      await blendizzardService.selectFaction(userAddress, selectedFaction, signer);

      onSuccess();
    } catch (err) {
      console.error('Failed to select faction:', err);
      setError(err instanceof Error ? err.message : 'Failed to select faction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border-2 border-purple-200">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
          Choose Your Faction
        </h2>
        <p className="text-gray-700 font-semibold">
          Your faction cannot be changed once selected. Choose wisely!
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {FACTIONS.map((faction) => {
          const isSelected = selectedFaction === faction.id;

          return (
            <button
              key={faction.id}
              onClick={() => setSelectedFaction(faction.id)}
              className={`
                relative p-6 rounded-2xl border-2 transition-all duration-300
                ${isSelected
                  ? `${faction.bgColor} ${faction.borderColor} scale-105 shadow-2xl`
                  : 'bg-white/50 border-gray-200 hover:scale-102 hover:shadow-lg'
                }
              `}
            >
              {isSelected && (
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              <div className="text-6xl mb-4">{faction.emoji}</div>
              <h3 className={`text-xl font-black mb-2 bg-gradient-to-r ${faction.color} bg-clip-text text-transparent`}>
                {faction.name}
              </h3>
              <p className="text-xs text-gray-700 font-medium leading-relaxed">
                {faction.description}
              </p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={handleSelectFaction}
        disabled={selectedFaction === null || loading}
        className={`
          w-full py-4 rounded-2xl font-bold text-white transition-all duration-300 text-lg
          ${selectedFaction !== null && !loading
            ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 shadow-xl hover:shadow-2xl transform hover:scale-105'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Joining Faction...
          </span>
        ) : selectedFaction !== null ? (
          `Join ${FACTIONS[selectedFaction].name}`
        ) : (
          'Select a Faction'
        )}
      </button>
    </div>
  );
}
