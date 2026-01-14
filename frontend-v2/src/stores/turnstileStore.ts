import { create } from 'zustand'

interface TurnstileStore {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
}

/**
 * Shared headers object for Relayer requests.
 * Can be passed by reference when making manual Relayer calls.
 */
export const relayerHeaders: Record<string, string> = {}

/**
 * Zustand store for managing Cloudflare Turnstile token.
 * The token is obtained from the Turnstile widget callback
 * and can be used for bot-protected transaction submissions.
 */
export const useTurnstileStore = create<TurnstileStore>((set) => ({
  token: null,
  setToken: (token: string) => {
    // Update the shared headers object for Relayer
    relayerHeaders['X-Turnstile-Response'] = token
    set({ token })
  },
  clearToken: () => {
    delete relayerHeaders['X-Turnstile-Response']
    set({ token: null })
  },
}))

/**
 * Callback function for Cloudflare Turnstile widget.
 * Called by the Turnstile widget when a token is generated.
 */
export function turnstileCallback(token: string) {
  useTurnstileStore.getState().setToken(token)
}
