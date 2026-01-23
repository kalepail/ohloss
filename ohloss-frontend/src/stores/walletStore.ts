import { create } from 'zustand'

interface WalletState {
  address: string | null
  isConnected: boolean
  error: string | null

  setAddress: (address: string | null) => void
  setError: (error: string | null) => void
  disconnect: () => void
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  isConnected: false,
  error: null,

  setAddress: (address) =>
    set({
      address,
      isConnected: !!address,
      error: null,
    }),

  setError: (error) =>
    set({ error }),

  disconnect: () =>
    set({
      address: null,
      isConnected: false,
      error: null,
    }),
}))
