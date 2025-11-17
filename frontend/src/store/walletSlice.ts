import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WalletState {
  // Wallet connection
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;

  // Network info
  network: string | null;
  networkPassphrase: string | null;

  // Error handling
  error: string | null;

  // Actions
  setPublicKey: (publicKey: string) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setNetwork: (network: string, networkPassphrase: string) => void;
  setError: (error: string | null) => void;
  disconnect: () => void;
  reset: () => void;
}

const initialState = {
  publicKey: null,
  isConnected: false,
  isConnecting: false,
  network: null,
  networkPassphrase: null,
  error: null,
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      ...initialState,

      setPublicKey: (publicKey) =>
        set({
          publicKey,
          isConnected: true,
          isConnecting: false,
          error: null,
        }),

      setConnected: (connected) =>
        set({
          isConnected: connected,
          isConnecting: false,
        }),

      setConnecting: (connecting) =>
        set({
          isConnecting: connecting,
          error: null,
        }),

      setNetwork: (network, networkPassphrase) =>
        set({
          network,
          networkPassphrase,
        }),

      setError: (error) =>
        set({
          error,
          isConnecting: false,
        }),

      disconnect: () =>
        set({
          ...initialState,
        }),

      reset: () => set(initialState),
    }),
    {
      name: 'blendizzard-wallet',
      partialize: (state) => ({
        // Only persist these fields
        publicKey: state.publicKey,
        network: state.network,
        networkPassphrase: state.networkPassphrase,
      }),
    }
  )
);
