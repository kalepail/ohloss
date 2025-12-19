/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL: string
  readonly VITE_NETWORK_PASSPHRASE: string
  readonly VITE_NUMBER_GUESS_CONTRACT: string
  readonly VITE_OHLOSS_CONTRACT: string
  readonly VITE_OHLOSS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
