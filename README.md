# Blendizzard

A faction-based competitive gaming protocol built on Stellar's Soroban smart contract platform. Blendizzard combines DeFi yield generation with gaming mechanics, enabling players to compete using faction points earned from their deposits.

## Overview

Blendizzard creates a gamified DeFi experience where:

- **Players deposit assets** into a yield-generating vault (via Blend protocol's fee-vault-v2)
- **Earn faction points (FP)** based on deposit amount and time held (asymptotic multipliers)
- **Choose a faction**: WholeNoodle (0), PointyStick (1), or SpecialRock (2)
- **Compete in games** by wagering faction points against other players
- **Win rewards** every 4-day epoch - the faction with the most contributed FP shares the accumulated BLND yield (auto-converted to USDC)

## Key Features

### Core Mechanics
- **Deposit/Withdrawal**: Players interact directly with fee-vault-v2 for yield generation
- **Faction Points System**: Dynamic multipliers based on amount ($1,000 asymptote) and time (35-day asymptote)
- **Game Sessions**: Wager FP in whitelisted game contracts with oracle verification
- **Epoch System**: 4-day cycles with automatic yield distribution to winning faction
- **Reward Claims**: Proportional USDC rewards based on FP contribution

### Security Features
- **Emergency Pause**: Admin can halt all player functions in case of vulnerabilities
- **Game Authorization**: Only whitelisted game contracts can submit outcomes via `require_auth()`
- **TTL Management**: Automatic storage extension (7-day threshold, 30-day extension)
- **FP Reset Logic**: >50% withdrawals during epoch reset time multiplier to prevent gaming
- **Reentrancy Protection**: Soroban's authorization framework provides protocol-level protection

### Production Ready
- ✅ 61/61 comprehensive tests passing
- ✅ All critical features implemented and tested
- ✅ Security documentation complete
- ✅ Ready for testnet deployment and external audit

## Project Structure

```text
blendizzard/
├── contracts/
│   └── blendizzard/
│       ├── src/
│       │   ├── lib.rs              # Main contract interface (27 exported functions)
│       │   ├── types.rs            # Data structures and configuration
│       │   ├── storage.rs          # Storage utilities and TTL management
│       │   ├── vault.rs            # Deposit/withdraw operations
│       │   ├── faction.rs          # Faction selection and locking
│       │   ├── faction_points.rs   # FP calculation with multipliers
│       │   ├── game.rs             # Game lifecycle (start/end)
│       │   ├── epoch.rs            # Epoch cycling and BLND→USDC conversion
│       │   ├── rewards.rs          # Reward distribution
│       │   ├── events.rs           # Event emissions (#[contractevent])
│       │   ├── errors.rs           # Error definitions
│       │   └── tests/              # Comprehensive test suite
│       └── Cargo.toml
├── bunt/                           # TypeScript integration tests (Bun runtime)
├── frontend/                       # React web application
├── fp_simulations/                 # Python multiplier simulations
├── docs/
│   ├── PLAN.md                     # Detailed technical specification
│   ├── SECURITY.md                 # Security analysis and best practices
│   ├── PRODUCTION_READINESS.md     # Production deployment checklist
│   ├── OG_PLAN.md                  # Original requirements
│   └── SUGGESTED_ADDITIONS.md      # Future enhancements
├── CLAUDE.md                       # AI assistant development guide
├── Cargo.toml                      # Workspace configuration
└── README.md                       # This file
```

## Quick Start

### Prerequisites

- **Rust** 1.84.0+ with `wasm32v1-none` target
- **Stellar CLI** (latest version)
- **Bun** (for TypeScript tests, NOT Node.js)

```bash
# Install Rust target
rustup target add wasm32v1-none

# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Install Bun (macOS/Linux)
curl -fsSL https://bun.sh/install | bash
```

### Build the Contract

```bash
cd contracts/blendizzard
stellar contract build
```

**Output**: `target/wasm32v1-none/release/blendizzard.wasm`

### Run Tests

```bash
# Rust unit and integration tests
cargo test

# TypeScript integration tests (requires Bun)
cd bunt
bun install
bun test
```

**Current Status**: 61/61 Rust tests passing ✅

## Deployment

### Testnet Deployment

```bash
# Deploy contract
stellar contract deploy \
  --wasm target/wasm32v1-none/release/blendizzard.wasm \
  --source admin \
  --network testnet

# Initialize contract
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source admin \
  --network testnet \
  -- __constructor \
  --admin <ADMIN_ADDR> \
  --fee_vault <VAULT_ADDR> \
  --soroswap_router <ROUTER_ADDR> \
  --blnd_token <BLND_ADDR> \
  --usdc_token <USDC_ADDR> \
  --epoch_duration 300  # 5 minutes for testing (default: 345600 = 4 days)
```

### Mainnet Deployment

**Status**: Not ready - requires external security audit and full testnet validation.

**Blockers**:
1. External security audit (4-6 weeks)
2. Oracle infrastructure operational
3. Bug bounty program active
4. Full integration testing on testnet (2-4 weeks)

**Timeline**: 8-13 weeks to mainnet

## Architecture

### External Dependencies

Blendizzard integrates with three external Soroban contracts:

1. **fee-vault-v2** ([script3/fee-vault-v2](https://github.com/script3/fee-vault-v2))
   - Yield-generating vault for BLND token
   - Players interact directly for deposits/withdrawals
   - Blendizzard queries balances and acts as admin to withdraw accumulated fees
   - Methods: `deposit()`, `withdraw()`, `get_underlying_tokens()`, `admin_withdraw()`

2. **Soroswap Router** ([soroswap/core](https://github.com/soroswap/core))
   - DEX for BLND → USDC conversion during epoch cycling
   - Method: `swap_exact_tokens_for_tokens()`

3. **soroban-fixed-point-math** ([kalepail/soroban-fixed-point-math](https://github.com/kalepail/soroban-fixed-point-math))
   - Safe fixed-point arithmetic library
   - Methods: `fixed_mul_floor()`, `fixed_div_floor()`

### Faction Points (FP) Calculation

FP uses asymptotic multipliers to reward larger deposits and longer holding times:

```
fp = base_deposit × amount_multiplier × time_multiplier
```

**Amount Multiplier**: Asymptotic curve toward $1,000 USD
```
multiplier = 1.0 + (amount_usd / (amount_usd + $1000))
```
- $0 → 1.0x
- $1,000 → ~1.5x
- $3,000 → ~1.75x
- $9,000 → ~1.9x

**Time Multiplier**: Asymptotic curve toward 35 days
```
multiplier = 1.0 + (time_held_seconds / (time_held_seconds + 35_days))
```
- 0 days → 1.0x
- 35 days → ~1.5x
- 70 days → ~1.67x

**Reset Penalty**: Withdrawing >50% of epoch balance resets timestamp to 0, dropping time multiplier back to 1.0x.

### Game Flow

1. **Deposit**: Player deposits USDC directly into fee-vault-v2 (earns BLND yield)
2. **Select Faction**: Choose WholeNoodle, PointyStick, or SpecialRock
3. **Start Game**: Wager FP against another player (faction locks on first game of epoch)
4. **Play**: Off-chain gameplay with oracle verification
5. **End Game**: Winner gains FP from loser, contributes to faction standings
6. **Epoch End**: After 4 days, winning faction shares USDC rewards proportionally
7. **Claim Rewards**: Players claim their share of the reward pool

### Epoch Cycling

Every 4 days (345,600 seconds):

1. Determine winning faction (highest total FP contributed)
2. Withdraw accumulated BLND from fee-vault admin balance
3. Convert BLND → USDC via Soroswap
4. Set reward pool (USDC amount)
5. Players from winning faction can claim proportional rewards

## Exported Functions (27)

### Admin Functions
- `__constructor` - Initialize contract
- `set_admin` - Update admin address
- `get_admin` - Query admin address
- `update_config` - Update epoch duration
- `upgrade` - Update contract WASM
- `pause` / `unpause` - Emergency controls
- `is_paused` - Query pause state

### Game Registry
- `add_game` - Whitelist game contract
- `remove_game` - Remove game contract
- `is_game` - Check if contract is whitelisted

### Vault Operations
- `deposit` - Deposit USDC into vault
- `withdraw` - Withdraw from vault (may reset FP)

### Faction Management
- `select_faction` - Choose faction (WholeNoodle/PointyStick/SpecialRock)
- `is_faction_locked` - Check if faction is locked for epoch

### Game Lifecycle
- `start_game` - Lock FP and start game session
- `end_game` - Verify outcome and spend FP (winner's FP contributes to faction)

### Epoch Management
- `get_epoch` - Get epoch information
- `cycle_epoch` - Finalize epoch and start next
- `get_faction_standings` - Query faction FP totals
- `get_winning_faction` - Get winner of finalized epoch
- `get_reward_pool` - Get USDC reward pool for epoch

### Rewards
- `claim_yield` - Claim USDC rewards for finalized epoch
- `get_claimable_amount` - Calculate pending rewards
- `has_claimed_rewards` - Check if player claimed for epoch

### Player Queries
- `get_player` - Get persistent player data
- `get_epoch_player` - Get epoch-specific player data

## Development

### Adding Dependencies

**Always research latest versions before adding/updating dependencies:**

```bash
# Example: Adding a new crate
# 1. Research latest stable version
rust-docs: cache_crate_from_cratesio("new-package", "x.y.z")
rust-docs: structure("new-package", "x.y.z")

# 2. Add to workspace (root Cargo.toml)
[workspace.dependencies]
new-package = "x.y.z"

# 3. Use in contract (contracts/blendizzard/Cargo.toml)
[dependencies]
new-package = { workspace = true }
```

**Critical**: All dependencies must use the same `soroban-sdk` version (currently 23.1.0).

### Generating TypeScript Bindings

```bash
cd bunt
stellar contract bindings typescript \
  --wasm ../contracts/blendizzard/target/wasm32v1-none/release/blendizzard.wasm \
  --output-dir ./bindings/blendizzard \
  --contract-id <CONTRACT_ID>
```

### Writing Tests

```rust
// Rust tests in contracts/blendizzard/src/tests/
#[test]
fn test_deposit_withdraw() {
    let env = Env::default();
    // ... test logic
}
```

```typescript
// TypeScript tests in bunt/test/ (uses Bun)
import { test, expect } from "bun:test";

test("deposit increases balance", async () => {
  // ... test logic
});
```

## Documentation

- **[PLAN.md](docs/PLAN.md)** - Detailed technical specification
- **[SECURITY.md](docs/SECURITY.md)** - Security analysis and attack mitigation
- **[PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)** - Production deployment checklist
- **[CLAUDE.md](docs/CLAUDE.md)** - AI assistant development guide
- **[OG_PLAN.md](docs/OG_PLAN.md)** - Original requirements
- **[SUGGESTED_ADDITIONS.md](docs/SUGGESTED_ADDITIONS.md)** - Future enhancements

## Current Status

**Version**: 0.1.0
**Build Status**: ✅ Successful
**Test Status**: ✅ 61/61 Tests Passing
**Testnet Ready**: ✅ Yes
**Mainnet Ready**: ⏳ Requires audit

### Completed Features
- ✅ Vault integration (deposit/withdraw)
- ✅ Faction points with asymptotic multipliers
- ✅ Game lifecycle with authorization
- ✅ Epoch cycling with BLND→USDC conversion
- ✅ Reward distribution system
- ✅ Emergency pause mechanism
- ✅ TTL storage management
- ✅ Modern event emissions
- ✅ Comprehensive test coverage

### Next Steps
1. Deploy to Stellar testnet
2. Conduct integration testing with live fee-vault and Soroswap
3. Engage external security auditors
4. Launch bug bounty program
5. Mainnet deployment (after audit approval)

## Contributing

This is a production smart contract protocol. All changes must:

1. Include comprehensive tests
2. Follow Soroban best practices (no_std, checked arithmetic, proper auth)
3. Use `soroban-fixed-point-math` for all multiplier calculations
4. Update documentation
5. Pass security review

## License

[Add license information]

## Support

- Issues: [GitHub Issues](https://github.com/[your-org]/blendizzard/issues)
- Documentation: See `docs/` directory
- Security: See [SECURITY.md](docs/SECURITY.md) for reporting vulnerabilities
