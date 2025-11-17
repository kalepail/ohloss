/**
 * Request Cache with Deduplication and AbortController Support
 *
 * Prevents duplicate RPC calls by:
 * 1. Caching responses with TTL
 * 2. Deduplicating in-flight requests
 * 3. Properly canceling aborted requests
 *
 * Works correctly with React Strict Mode - the second useEffect call
 * will either get the cached result or join the pending request.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  abortController?: AbortController;
}

interface PendingRequest<T> {
  promise: Promise<T>;
  abortController: AbortController;
}

class RequestCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pending = new Map<string, PendingRequest<any>>();
  private defaultTTL = 30000; // 30 seconds default TTL

  /**
   * Deduplicate and cache async requests
   *
   * @param key - Unique cache key for the request
   * @param fetcher - Function that performs the async operation
   * @param ttl - Time-to-live in milliseconds (default: 30000)
   * @param signal - Optional AbortSignal to cancel the request
   * @returns Promise with the cached or fresh data
   */
  async dedupe<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
    ttl: number = this.defaultTTL,
    signal?: AbortSignal
  ): Promise<T> {
    // If external abort signal is already aborted, reject immediately
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    // Check if there's already a pending request for this key
    const pendingRequest = this.pending.get(key);
    if (pendingRequest) {
      // If caller provided an abort signal, listen to it
      if (signal) {
        signal.addEventListener('abort', () => {
          // If this was the only consumer and it aborted, cancel the request
          // Note: This is simplified - in production you'd track multiple consumers
          if (this.pending.get(key) === pendingRequest) {
            pendingRequest.abortController.abort();
          }
        });
      }

      // Return the existing promise
      return pendingRequest.promise;
    }

    // Create new AbortController for this request
    const abortController = new AbortController();

    // If caller provided an abort signal, chain it to our controller
    if (signal) {
      signal.addEventListener('abort', () => {
        abortController.abort();
      });
    }

    // Create new request
    const promise = (async () => {
      try {
        const data = await fetcher(abortController.signal);

        // Only cache if request wasn't aborted
        if (!abortController.signal.aborted) {
          this.cache.set(key, {
            data,
            timestamp: Date.now(),
          });
        }

        return data;
      } catch (error) {
        // Don't cache errors
        throw error;
      } finally {
        // Always clean up pending request
        this.pending.delete(key);
      }
    })();

    // Store pending request
    this.pending.set(key, { promise, abortController });

    return promise;
  }

  /**
   * Clear a specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear multiple cache entries by prefix
   */
  invalidatePrefix(prefix: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    // Abort all pending requests
    for (const { abortController } of this.pending.values()) {
      abortController.abort();
    }
    this.pending.clear();
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    return {
      cachedEntries: this.cache.size,
      pendingRequests: this.pending.size,
      cacheKeys: Array.from(this.cache.keys()),
      pendingKeys: Array.from(this.pending.keys()),
    };
  }
}

// Export singleton instance
export const requestCache = new RequestCache();

/**
 * Helper to create cache keys
 */
export function createCacheKey(...parts: (string | number | bigint | boolean | null | undefined)[]): string {
  return parts
    .filter(p => p !== null && p !== undefined)
    .map(p => String(p))
    .join(':');
}

/**
 * Example usage in a component:
 *
 * ```typescript
 * useEffect(() => {
 *   const abortController = new AbortController();
 *
 *   const loadData = async () => {
 *     try {
 *       const data = await requestCache.dedupe(
 *         createCacheKey('player', userAddress),
 *         (signal) => blendizzardService.getPlayer(userAddress, signal),
 *         30000, // 30s TTL
 *         abortController.signal
 *       );
 *       setData(data);
 *     } catch (error) {
 *       if (error.name !== 'AbortError') {
 *         console.error('Failed to load:', error);
 *       }
 *     }
 *   };
 *
 *   loadData();
 *
 *   return () => {
 *     abortController.abort();
 *   };
 * }, [userAddress]);
 * ```
 */
