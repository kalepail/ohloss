# Blendizzard Frontend

A React + TypeScript frontend for the Blendizzard faction-based competitive gaming protocol on Stellar Soroban.

## Features

- **Wallet Integration**: Connect with Freighter and other Stellar wallets
- **Vault Management**: Deposit/withdraw USDC to earn Faction Points (FP)
- **Faction Selection**: Choose between WholeNoodle, PointyStick, and SpecialRock
- **Number Guessing Game**: Play against other players with FP wagers
- **Epoch System**: Compete for yield rewards each epoch
- **Reward Claiming**: Claim your share of the prize pool

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool (using rolldown-vite)
- **Tailwind CSS** - Styling with glassmorphism
- **Zustand** - State management
- **React Query** - Server state management
- **Stellar SDK** - Blockchain interactions
- **Stellar Wallets Kit** - Multi-wallet support

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Freighter Wallet](https://www.freighter.app/) browser extension

### Installation

```bash
# Install dependencies
bun install

# Start development server
bun dev
```

### Environment Variables

The `.env` file is already configured with mainnet contract addresses. See `.env.example` for the template.

## Project Structure

```
src/
├── components/       # React components
│   ├── wallet/      # Wallet connection components
│   ├── vault/       # Deposit/withdrawal components
│   ├── game/        # Game interface components
│   ├── faction/     # Faction selection components
│   ├── epoch/       # Epoch display components
│   ├── rewards/     # Reward claiming components
│   └── common/      # Shared components
├── hooks/           # Custom React hooks
├── services/        # Contract interaction services
├── store/           # Zustand state stores
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

## Development

```bash
# Run dev server
bun dev

# Build for production
bun run build

# Preview production build
bun run preview

# Lint code
bun run lint

# Format code
bunx prettier --write "src/**/*.{ts,tsx}"
```

## Contract Addresses (Mainnet)

- **Blendizzard**: `CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU`
- **Number Guess Game**: `CDB6IODG5BNNVILLJXBXYZVR7NP4HDO2NL7WALWIXGIDMA6VY4V75CEX`
- **Fee Vault v2**: `CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y`
- **USDC Token**: `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`
- **BLND Token**: `CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY`

## Key Features

### Faction System

Three factions compete each epoch:

- **WholeNoodle** (Blue) - Faction 0
- **PointyStick** (Red) - Faction 1
- **SpecialRock** (Green) - Faction 2

### Faction Points (FP)

FP are earned by depositing USDC into the fee-vault-v2 contract. The amount of FP is calculated with multipliers:

- **Amount Multiplier**: Asymptotic curve toward $1,000 deposit
- **Time Multiplier**: Asymptotic curve toward 30 days holding

### Multi-Signature Game Creation

Creating a game requires multiple signers for security. The frontend handles the multi-sig flow.

## Next Steps

See [TODO.md](./TODO.md) for the complete implementation checklist.

Current status:
- ✅ Project setup and dependencies
- ✅ Tailwind CSS configuration
- ✅ Environment variables (mainnet)
- ✅ Folder structure
- ✅ Base utilities and types
- 🚧 Contract TypeScript bindings (pending)
- 🚧 Wallet integration (pending)
- 🚧 Contract services layer (pending)
- 🚧 UI components (pending)

## License

Apache-2.0

## Links

- [Blendizzard Repo](https://github.com/kalepail/blendizzard)
- [Stellar Soroban Docs](https://soroban.stellar.org)
- [Fee Vault v2](https://github.com/script3/fee-vault-v2)
