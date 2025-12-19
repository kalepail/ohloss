import { useState, useEffect, useRef } from 'react'
import { useWalletStore } from '@/store/walletStore'
import { usePendingGamesStore } from '@/store/pendingGamesStore'
import { useAvailableFp } from '@/hooks/useAvailableFp'
import { formatAddress, formatWager, getFactionInfo } from '@/types/game'
import { getPlayerFaction } from '@/services/ohlossService'
import { useNavigate } from 'react-router-dom'

export default function Header() {
  const { address, isConnected, disconnect } = useWalletStore()
  const { getGamesForPlayer } = usePendingGamesStore()
  const { availableFp } = useAvailableFp()
  const navigate = useNavigate()

  const [faction, setFaction] = useState<number | null>(null)
  const factionFetchRef = useRef<string | null>(null)

  // Fetch faction when address changes
  useEffect(() => {
    if (!address || factionFetchRef.current === address) return
    factionFetchRef.current = address

    getPlayerFaction(address).then(setFaction).catch(() => setFaction(null))
  }, [address])

  // Reset faction when disconnected
  useEffect(() => {
    if (!isConnected) {
      setFaction(null)
      factionFetchRef.current = null
    }
  }, [isConnected])

  const factionInfo = getFactionInfo(faction)

  // Count active games (not complete)
  const activeGamesCount = address
    ? getGamesForPlayer(address).filter((g) => g.status !== 'complete').length
    : 0

  const handleDisconnect = () => {
    disconnect()
    navigate('/')
  }

  return (
    <header className="border-b border-game-border bg-white/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => navigate(isConnected ? '/lobby' : '/')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-game-primary to-game-secondary flex items-center justify-center">
            <span className="text-white text-xl font-bold">#</span>
          </div>
          <span className="font-display font-bold text-xl text-game-text">
            Number Guess
          </span>
        </button>

        {/* Navigation & Wallet Info */}
        {isConnected && address && (
          <div className="flex items-center gap-3">
            {/* Available FP display */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-game-primary/10 text-game-primary">
              <span className="text-sm">⚡</span>
              <span className="font-display font-bold text-sm">
                {formatWager(availableFp)} FP
              </span>
            </div>

            {/* Your Games button with badge */}
            <button
              onClick={() => navigate('/games')}
              className="btn-ghost px-3 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-game-primary/10"
            >
              <span>Your Games</span>
              {activeGamesCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-game-primary text-white text-xs font-bold flex items-center justify-center">
                  {activeGamesCount}
                </span>
              )}
            </button>

            {/* Faction badge */}
            {factionInfo && (
              <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${factionInfo.bg} ${factionInfo.color}`}>
                <span className="text-sm">{factionInfo.emoji}</span>
                <span className="font-medium text-sm">{factionInfo.name}</span>
              </div>
            )}

            <div className="badge badge-info">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
              {formatAddress(address)}
            </div>
            <button
              onClick={handleDisconnect}
              className="btn-ghost px-3 py-2 rounded-lg text-sm"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
