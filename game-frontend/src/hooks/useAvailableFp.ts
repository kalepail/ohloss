/**
 * Hook to fetch and cache the player's available FP.
 * Shared between Header and LobbyPage for consistent display.
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useWalletStore } from '@/store/walletStore'
import { getAvailableFp } from '@/services/ohlossService'

// Cache to prevent duplicate fetches across components
const fpCache = new Map<string, { fp: bigint; fetchedAt: number }>()
const CACHE_TTL_MS = 12_000 // 12 seconds
const POLL_INTERVAL_MS = 12_000

/**
 * Pre-populate the FP cache (used when data is fetched elsewhere, e.g., getGamePageData).
 * This prevents duplicate RPC calls when useAvailableFp mounts.
 */
export function preFillFpCache(address: string, fp: bigint): void {
  fpCache.set(address, { fp, fetchedAt: Date.now() })
}

export function useAvailableFp() {
  const { address } = useWalletStore()
  const { availableFp, setAvailableFp } = useGameStore()
  const fetchingRef = useRef(false)
  const lastFpRef = useRef<bigint>(availableFp)

  useEffect(() => {
    lastFpRef.current = availableFp
  }, [availableFp])

  useEffect(() => {
    if (!address) return

    const fetchFp = async () => {
      // Check cache first
      const cached = fpCache.get(address)
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        if (lastFpRef.current !== cached.fp) {
          setAvailableFp(cached.fp)
        }
        return
      }

      // Prevent concurrent fetches
      if (fetchingRef.current) return
      fetchingRef.current = true

      try {
        const fp = await getAvailableFp(address)
        fpCache.set(address, { fp, fetchedAt: Date.now() })
        if (lastFpRef.current !== fp) {
          setAvailableFp(fp)
        }
      } catch (err) {
        console.error('[useAvailableFp] Error:', err)
      } finally {
        fetchingRef.current = false
      }
    }

    // Initial fetch and periodic refresh (bounded by cache TTL).
    fetchFp()
    const interval = setInterval(fetchFp, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [address, setAvailableFp])

  const refresh = async () => {
    if (!address || fetchingRef.current) return

    fetchingRef.current = true
    try {
      const fp = await getAvailableFp(address)
      fpCache.set(address, { fp, fetchedAt: Date.now() })
      setAvailableFp(fp)
    } catch (err) {
      console.error('[useAvailableFp] Refresh error:', err)
    } finally {
      fetchingRef.current = false
    }
  }

  return {
    availableFp,
    refresh,
    isLoading: fetchingRef.current,
  }
}
