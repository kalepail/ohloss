# Bunt - Ohloss TypeScript Testing

This directory contains TypeScript bindings and end-to-end tests for the Ohloss contracts.

## Structure

```
bunt/
├── bindings/           # Auto-generated TypeScript bindings (workspace packages)
│   ├── ohloss/    # Ohloss contract bindings
│   ├── fee-vault/      # Fee Vault v2 contract bindings
│   └── number-guess/   # Number Guess game contract bindings
├── e2e-game.ts         # End-to-end game test script
├── set_admin.ts        # Admin management script
├── upgrade_contract.ts # Contract upgrade script
├── test-*.ts           # Various test and debug scripts
└── package.json        # Bun workspace configuration
```

## Setup

### 1. Install Dependencies

```bash
bun install
```

This will install dependencies for the root package and all workspace bindings.

### 2. Build Bindings

```bash
bun run build:bindings
```

This compiles all TypeScript bindings to JavaScript.

### 3. Update Dependencies

```bash
bun run ncu
```

This runs `ncu -u` in the root and all bindings directories.

## Regenerating Bindings

If contracts are redeployed or updated:

```bash
# Ohloss
stellar contract bindings typescript \
  --contract-id CAK6Z6KFMB3V2ENEJ7THVKXUYQ5EG7EL2TM5UQ2FLDXI37FS6DRIMIZH \
  --output-dir ./bindings/ohloss \
  --overwrite

# Fee Vault
stellar contract bindings typescript \
  --contract-id CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y \
  --output-dir ./bindings/fee-vault \
  --overwrite

# Number Guess
stellar contract bindings typescript \
  --contract-id CDB6IODG5BNNVILLJXBXYZVR7NP4HDO2NL7WALWIXGIDMA6VY4V75CEX \
  --output-dir ./bindings/number-guess \
  --overwrite

# Then rebuild
bun run build:bindings
```

## Running End-to-End Tests

### Prerequisites

1. Funded Stellar accounts (Player 1 and Player 2)
2. USDC balance for deposits
3. Contracts deployed and initialized (see CHITSHEET.md)

### Environment Setup

```bash
export PLAYER1_SECRET="SC..."  # Player 1 secret key
export PLAYER2_SECRET="SC..."  # Player 2 secret key
```

### Run Test

**⚠️ DO NOT RUN YET - Review the script first!**

```bash
bun e2e-game.ts
```

### Test Flow

The `e2e-game.ts` script demonstrates a complete game:

1. **Deposit**: Both players deposit 1000 USDC to fee-vault
2. **Select Factions**: Player 1 → WholeNoodle, Player 2 → PointyStick
3. **Check State**: Verify initial player data and FP
4. **Start Game**: Create number-guess game (locks FP via ohloss)
5. **Make Guesses**: Players guess numbers (1-10)
6. **Reveal Winner**: Complete game (burns FP, updates faction standings)
7. **Verify Results**: Check final FP state and faction standings

## Contract Addresses (Mainnet)

See `CHITSHEET.md` in the root directory for current deployed addresses.

## Workspace Configuration

This project uses Bun workspaces to manage the bindings as local packages:

```json
{
  "workspaces": ["bindings/*"],
  "dependencies": {
    "ohloss": "workspace:*",
    "fee-vault": "workspace:*",
    "number-guess": "workspace:*"
  }
}
```

This allows importing bindings directly:

```typescript
import { Contract as OhlossContract } from 'ohloss';
```

---

*This project uses [Bun](https://bun.com), a fast all-in-one JavaScript runtime.*
