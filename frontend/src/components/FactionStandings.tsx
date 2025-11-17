import { useState, useEffect } from 'react';
import { blendizzardService } from '@/services/blendizzardService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { USDC_DECIMALS } from '@/utils/constants';

interface FactionStandingsProps {
  currentEpoch: number;
  refreshTrigger?: number;
}

const FACTIONS = [
  { id: 0, name: 'WholeNoodle', emoji: '🍜', color: 'from-yellow-500 to-orange-500' },
  { id: 1, name: 'PointyStick', emoji: '🗡️', color: 'from-blue-500 to-cyan-500' },
  { id: 2, name: 'SpecialRock', emoji: '🪨', color: 'from-gray-500 to-slate-500' },
];

export function FactionStandings({ currentEpoch, refreshTrigger }: FactionStandingsProps) {
  const [standings, setStandings] = useState<Array<{ faction: typeof FACTIONS[0]; points: bigint }>>([]);
  const [loading, setLoading] = useState(true);

  // Ensure refreshTrigger is always a number for stable dependency array
  const stableRefreshTrigger = refreshTrigger ?? 0;

  useEffect(() => {
    const abortController = new AbortController();

    const loadStandings = async () => {
      try {
        // Don't show loading spinner on auto-refresh, only on initial load
        if (standings.length === 0) {
          setLoading(true);
        }

        // Use requestCache to prevent duplicate calls
        const epochInfo = await requestCache.dedupe(
          createCacheKey('epoch', currentEpoch),
          () => blendizzardService.getEpoch(currentEpoch),
          30000,
          abortController.signal
        );

      const standingsData = FACTIONS.map((faction) => {
        let points = 0n;
        if (epochInfo.faction_standings) {
          // Soroban Maps are serialized as JS Map objects
          // Check if it's actually a Map or if we need to convert it
          let factionPoints;

          if (epochInfo.faction_standings instanceof Map) {
            factionPoints = epochInfo.faction_standings.get(faction.id);
          } else if (Array.isArray(epochInfo.faction_standings)) {
            // If it's an array of [key, value] tuples
            const entry = (epochInfo.faction_standings as Array<[number, any]>).find(([k]) => k === faction.id);
            factionPoints = entry ? entry[1] : undefined;
          } else if (typeof epochInfo.faction_standings === 'object') {
            // If it's a plain object with numeric keys
            factionPoints = epochInfo.faction_standings[faction.id];
          }

          points = factionPoints !== undefined && factionPoints !== null ? BigInt(factionPoints) : 0n;
        }
        return { faction, points };
      }).sort((a, b) => Number(b.points - a.points));

        setStandings(standingsData);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Failed to load faction standings:', error);
          // Set empty standings on error to prevent constant error spam
          setStandings(FACTIONS.map(faction => ({ faction, points: 0n })));
        }
      } finally {
        setLoading(false);
      }
    };

    loadStandings();

    // Auto-refresh standings every 30 seconds
    const interval = setInterval(() => {
      // Invalidate cache before refresh to get fresh data
      requestCache.invalidate(createCacheKey('epoch', currentEpoch));
    }, 30000);

    return () => {
      clearInterval(interval);
      abortController.abort();
    };
  }, [currentEpoch, stableRefreshTrigger]);

  const formatPoints = (points: bigint): string => {
    const divisor = BigInt(10 ** USDC_DECIMALS);
    const whole = points / divisor;
    const remainder = points % divisor;

    // Format with 2 decimal places
    const decimal = Number(remainder) / Number(divisor);
    const formatted = Number(whole) + decimal;

    return formatted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-purple-100">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Faction Standings
        </h3>
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  const maxPoints = standings[0]?.points || 1n;

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-purple-100 hover:shadow-xl transition-shadow">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        Faction Standings
      </h3>
      <div className="space-y-3">
        {standings.map((standing, index) => {
          const percentage = maxPoints > 0n ? Number((standing.points * 100n) / maxPoints) : 0;

          return (
            <div key={standing.faction.id} className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{standing.faction.emoji}</span>
                  <span className="text-sm font-bold text-gray-800">
                    {standing.faction.name}
                  </span>
                  {index === 0 && standing.points > 0n && (
                    <span className="text-xs px-2 py-1 rounded-full bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-700 font-semibold border border-yellow-200">
                      Leading
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-gray-600">
                  {formatPoints(standing.points)} FP
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                <div
                  className={`h-full bg-gradient-to-r ${standing.faction.color} transition-all duration-500 shadow-sm`}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
