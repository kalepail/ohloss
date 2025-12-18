# CLAUDE.md - Frontend V2

## Stack

- **Runtime**: Bun (NOT npm/yarn/pnpm)
- **Framework**: React 19 + Vite + Tailwind CSS
- **Wallets**: smart-account-kit (passkey-based smart wallets)
- **Blockchain**: Stellar/Soroban (7 decimals for all tokens)
- **Deployment**: Cloudflare Workers via `@cloudflare/vite-plugin`

## Commands

```bash
bun install          # Install deps
bun run dev          # Dev server
bun run build        # Production build
npx tsc --noEmit     # Type check
bunx wrangler deploy # Deploy to Cloudflare
```

## Project Structure

```
src/
├── components/      # React components (pages + UI)
├── stores/          # Zustand stores (walletStore, blendizzardStore, turnstileStore)
├── lib/             # Services and utilities
│   ├── smartAccount.ts    # Smart Account Kit singleton
│   ├── contractService.ts # Blendizzard contract calls
│   └── swapService.ts     # XLM→USDC swap via Soroswap
worker/              # Cloudflare Worker for API proxy (keeps secrets server-side)
```

## Key Patterns

**Smart Account Kit**: Initialized once in `lib/smartAccount.ts`, accessed via `getKit()`. Handles passkey auth, transaction signing, and fee sponsoring via Launchtube.

**Zustand Stores**: State management. `walletStore` for connection state, `blendizzardStore` for game/vault data.

**Contract Calls**: Use generated bindings from `blendizzard` and `fee-vault` packages. All amounts use 7 decimal places (multiply by 10_000_000).

**Worker Proxy**: Routes like `/api/swap/quote` proxy to external APIs. Secrets in `.dev.vars` locally, Cloudflare dashboard for prod.

## MCP Tools

When researching frontend technologies:
- **context7**: `resolve-library-id` + `get-library-docs` for SDK documentation (stellar-sdk, react, zustand)
- **deepwiki**: `ask_question("repo/name", "...")` for understanding external repos
- **cloudflare**: `search_cloudflare_documentation` for Workers/Pages deployment
- **perplexity**: For recent updates, debugging, or best practices
- **github**: `get_file_contents` for reading source code from external repos

## Environment

All client env vars need `VITE_` prefix. See `.env.example` for full list. Key ones:
- `VITE_RPC_URL` - Stellar RPC
- `VITE_LAUNCHTUBE_URL` - Fee sponsoring (dev: launchtube.xyz)
- `VITE_TURNSTILE_SITE_KEY` - Bot protection (dev: test key `1x00000000000000000000BB`)
