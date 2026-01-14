# Number Guess Game Frontend

Standalone game UI for the Number Guess game contract. Communicates with the Ohloss wallet (ohloss-frontend) via popup window for transaction signing.

## Architecture

- Game runs on port 5174
- Opens popup to ohloss-frontend (port 5173) for wallet connection and signing
- Uses postMessage API for cross-window communication
- Passkey wallets only (no Freighter)

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env
# Fill in contract addresses

# Start dev server (requires ohloss-frontend running on :5173)
bun run dev
```

## Commands

```bash
bun install      # Install deps
bun run dev      # Dev server (localhost:5174)
bun run build    # Production build
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_RPC_URL` | Stellar RPC endpoint |
| `VITE_NUMBER_GUESS_CONTRACT` | Number Guess contract address |
| `VITE_OHLOSS_CONTRACT` | Ohloss contract address |
| `VITE_OHLOSS_URL` | ohloss-frontend URL for wallet popup |

## Game Flow

1. Player 1: Connect wallet via popup
2. Player 1: Create game, sign auth entry, copy invite link
3. Player 2: Connect wallet, paste invite link, sign auth entry
4. Both: Pick numbers (1-10), sign and submit guesses
5. Either: Reveal winner
6. Winner gets confetti!

## Project Structure

```
game-frontend/
├── src/
│   ├── components/    # Header, NumberSelector, PlayerCard, etc.
│   ├── pages/         # ConnectPage, LobbyPage, GamePage
│   ├── services/      # numberGuessService, walletBridge
│   ├── store/         # Zustand stores
│   └── types/         # Message types for postMessage
└── TODO.md            # Detailed development log
```

## Related

- `ohloss-frontend/` - Main wallet app (handles signing popups)
- `contracts/number-guess/` - Game contract
