/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACTORY_CONTRACT_ID: string
  readonly VITE_NETWORK_PASSPHRASE: string
  readonly VITE_RPC_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {
  const content: string
  export default content
}
