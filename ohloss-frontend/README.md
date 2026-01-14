# Ohloss Frontend

The main Ohloss web application using passkey-based smart wallets.

## Stack

- **Runtime**: Bun
- **Framework**: React 19 + Vite + Tailwind CSS
- **Wallets**: smart-account-kit (passkey-based smart wallets)
- **Blockchain**: Stellar/Soroban (7 decimals for all tokens)
- **Deployment**: Cloudflare Workers via `@cloudflare/vite-plugin`

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Start dev server
bun run dev
```

## Commands

```bash
bun install          # Install deps
bun run dev          # Dev server (localhost:5173)
bun run build        # Production build
npx tsc --noEmit     # Type check
bunx wrangler deploy # Deploy to Cloudflare
```

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Description |
|----------|-------------|
| `VITE_RPC_URL` | Stellar RPC endpoint |
| `VITE_OHLOSS_CONTRACT` | Main contract address |
| `VITE_FEE_VAULT_CONTRACT` | Fee vault address |
| `VITE_RELAYER_URL` | Fee sponsoring service (OpenZeppelin Channels) |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare bot protection |
| `VITE_API_URL` | Backend API (api-worker) |

## Project Structure

```
ohloss-frontend/
├── src/
│   ├── components/      # React components
│   ├── stores/          # Zustand stores
│   └── lib/             # Services and utilities
├── worker/              # Cloudflare Worker (embedded API)
├── CLAUDE.md            # AI assistant guide
└── GAPS.md              # Implementation gaps tracking
```

## Features

- Passkey wallet creation and connection
- Vault deposits/withdrawals (via fee-vault-v2)
- Faction selection and standings
- Epoch management and cycling
- Player/developer reward claiming
- Transaction signing via popup (for game-frontend)

## Related

- `game-frontend/` - Number Guess game UI
- `api-worker/` - Backend API proxy
