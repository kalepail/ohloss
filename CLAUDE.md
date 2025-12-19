# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ohloss is a faction-based competitive gaming protocol on Stellar's Soroban platform. Players deposit assets into a yield-generating vault (via Blend protocol), earn faction points based on deposit amount and time, and compete in games by wagering these points. Every 4-day epoch, the winning faction shares the accumulated yield (BLND converted to USDC).

## Key Technologies

- **Soroban Smart Contracts** (Rust): Core game logic on Stellar blockchain
  - **soroban-sdk**: Version 23.1.0 (always research for latest stable before updating)
  - **soroban-fixed-point-math**: Custom fork from github.com/kalepail/soroban-fixed-point-math
- **Bun**: JavaScript runtime for testing and tooling (NOT Node.js)
- **TypeScript**: Type-safe contract bindings and integration tests

## Dependency Management

**CRITICAL: Always research package versions before adding or updating dependencies.**

### Current Core Dependencies
```toml
[workspace.dependencies]
soroban-sdk = "23.1.0"
soroban-fixed-point-math = { git = "https://github.com/kalepail/soroban-fixed-point-math" }
```

### Before Adding/Updating Dependencies:

1. **Research latest stable version:**
   - Use WebSearch: "soroban-sdk latest version 2025"
   - Check crates.io directly
   - Review release notes for breaking changes

2. **Verify compatibility:**
   - Ensure all dependencies use the same soroban-sdk version
   - Check for known issues or deprecations
   - Review migration guides if upgrading

3. **Use workspace inheritance:**
   ```toml
   # Root Cargo.toml
   [workspace.dependencies]
   new-package = "x.y.z"

   # Contract Cargo.toml
   [dependencies]
   new-package = { workspace = true }
   ```

### Example Research Process:
```bash
# 1. Search for latest version
perplexity: search("soroban-sdk latest release 2025")

# 2. Get library documentation
context7: resolve-library-id("stellar-sdk")
context7: get-library-docs(libraryId, topic="contracts")

# 3. Check for examples in repos
github: search_code("package-name soroban language:rust")
```

## Build and Test Commands

### Rust Contract

**Important:** Use `wasm32v1-none` target (Rust 1.84.0+) for stability. This locks to WebAssembly 1.0 features and prevents breaking changes from Rust updates.

```bash
# Install the wasm32v1-none target (one-time setup)
rustup target add wasm32v1-none

# Build the contract (RECOMMENDED - uses stellar CLI)
cd contracts/ohloss
stellar contract build

# Output location: target/wasm32v1-none/release/ohloss.wasm

# Alternative: Manual build with cargo
cargo build --target wasm32v1-none --release

# Run Rust unit tests
cargo test

# Optimize WASM (usually not needed - stellar contract build optimizes automatically)
stellar contract optimize --wasm target/wasm32v1-none/release/ohloss.wasm
```

**Why wasm32v1-none?**
- Locks to WebAssembly 1.0 (no unstable features)
- Prevents compatibility issues with Safari and older browsers
- Official recommendation from Stellar as of 2025
- `wasm32-unknown-unknown` is now considered a "moving target"

### TypeScript Tests with Bun

```bash
# Install dependencies (use Bun, NOT npm/yarn/pnpm)
cd bunt
bun install

# Run tests
bun test

# Run specific test file
bun test test/deposit.test.ts

# Watch mode
bun test --watch

# Generate TypeScript bindings from contract
stellar contract bindings typescript \
  --wasm ../contracts/ohloss/target/wasm32v1-none/release/ohloss.wasm \
  --output-dir ./bindings/ohloss \
  --contract-id <CONTRACT_ID>
```

### Deployment

```bash
# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/ohloss.wasm \
  --source admin \
  --network testnet
```

## Architecture

### Core Concepts

1. **Factions (3)**: WholeNoodle (0), PointyStick (1), SpecialRock (2)
2. **Epochs**: 4-day cycles (345,600 seconds)
3. **Faction Points (fp)**: Player scoring mechanism with multipliers
   - Amount multiplier: Asymptotic curve toward $1,000 USD deposit
   - Time multiplier: Asymptotic curve toward 35 days holding
   - Reset penalty: >50% net withdrawal between epochs resets time to 0
   - **Cross-Epoch Model**: FP calculated once at first game of epoch based on vault balance

### Architecture Model: Cross-Epoch Balance Tracking

**Key Design Principle**: Players interact directly with fee-vault-v2 for deposits/withdrawals. Ohloss queries balances and enforces game rules at epoch boundaries.

**Flow:**
1. Player deposits to fee-vault-v2 directly (no intermediate Ohloss deposit call)
2. Player plays first game of Epoch N → Ohloss queries vault balance
3. Balance compared to last epoch → If >50% withdrawal, reset time multiplier
4. FP calculated based on current balance + multipliers
5. FP remains valid for entire epoch (even if player withdraws mid-epoch)
6. Epoch N+1 starts → Fresh calculation at first game

**Benefits:**
- Simpler player flow (direct vault interaction)
- Reduced storage (~32 bytes per active player)
- Rewards sustained balances across many epochs
- Accepts mid-epoch capital flexibility

### Contract Structure

```
contracts/ohloss/src/
├── lib.rs              # Main contract entry point (27 exported functions)
├── types.rs            # Shared data structures and enums
├── storage.rs          # Storage utilities and TTL management
├── vault.rs            # Vault balance queries and cross-epoch comparison
├── faction.rs          # Faction management
├── faction_points.rs   # FP calculation with multipliers
├── game.rs             # Game lifecycle (start/end) with epoch initialization
├── epoch.rs            # Epoch cycling and management
├── rewards.rs          # Reward distribution
├── events.rs           # Event definitions (#[contractevent])
├── errors.rs           # Error definitions
├── fee_vault_v2.rs     # Fee vault client interface
├── router.rs           # Soroswap router client interface
└── tests/              # Comprehensive test suite (21 test files)
```

**Note**: `vault.rs` no longer contains deposit/withdraw methods. It provides:
- `get_vault_balance()` - Query player balance from fee-vault-v2
- `check_cross_epoch_withdrawal_reset()` - Compare balances between epochs

### External Dependencies

The contract integrates with three external Soroban contracts:

1. **fee-vault-v2** (https://github.com/script3/fee-vault-v2)
   - Yield-generating vault for BLND token
   - **Players interact directly**: Call `deposit()` and `withdraw()` on fee-vault-v2
   - **Ohloss queries balances**: `get_underlying_tokens(player)` at first game of epoch
   - **Admin role**: Ohloss withdraws accumulated fees via `admin_withdraw()`

2. **Soroswap Router** (https://github.com/soroswap/core)
   - DEX for BLND → USDC conversion during epoch cycling
   - Method: `swap_exact_tokens_for_tokens()`

3. **soroban-fixed-point-math** (https://github.com/script3/soroban-fixed-point-math)
   - Safe fixed-point arithmetic library
   - Methods: `fixed_mul_floor()`, `fixed_mul_ceil()`, `fixed_div_floor()`

### Data Structures

Key storage types (defined in contracts/ohloss/src/types.rs):

**Player (Persistent across epochs):**
```rust
pub struct Player {
    pub selected_faction: u32,       // Persistent faction preference
    pub deposit_timestamp: u64,      // Time multiplier tracking
    pub last_epoch_balance: i128,    // For cross-epoch comparison
}
```

**EpochPlayer (Per-epoch state):**
```rust
pub struct EpochPlayer {
    pub epoch_faction: Option<u32>,      // Locked faction for this epoch
    pub initial_balance: i128,           // Vault snapshot at first game
    pub available_fp: i128,              // Spendable FP
    pub locked_fp: i128,                 // FP locked in active games
    pub total_fp_contributed: i128,      // Reward distribution basis
}
```

**Other types:**
- `EpochInfo`: Epoch metadata and standings
- `GameSession`: Game session tracking
- `GameOutcome`: Verified game results

**Key Changes in Cross-Epoch Architecture:**
- Removed `Player.total_deposited` (query vault instead)
- Removed `EpochPlayer.withdrawn_this_epoch` (no within-epoch tracking)
- Renamed `initial_epoch_balance` → `initial_balance` (clearer naming)
- Added `Player.last_epoch_balance` (for cross-epoch withdrawal detection)

Storage keys use enum-based typing for collision-free access:
```rust
pub enum DataKey {
    Player(Address),
    EpochPlayer(u32, Address),
    Epoch(u32),
    Session(BytesN<32>),
}
```

## Soroban Development Rules

### Must Use

- `#![no_std]` at the top of every module
- `soroban_sdk` types: `Address`, `Env`, `Map`, `Vec`, `Symbol`, `BytesN`
- `symbol_short!()` macro for storage keys (NOT strings)
- References (`&env`, `&address`) to avoid cloning
- `soroban-fixed-point-math` for ALL multiplier calculations
- Checked arithmetic or `.expect()` on all math operations
- Event emissions for all state changes

### Must NOT Use

- Standard library types (`std::vec::Vec`, `std::collections::HashMap`, `String`)
- Unchecked arithmetic (prevents overflow exploits)
- `String` type (use `Symbol` for identifiers)
- Unbounded loops or recursion

### Fixed-Point Math Pattern

```rust
use soroban_fixed_point_math::FixedPoint;

const SCALAR_7: i128 = 10_000_000; // 7 decimal places

// Calculate: base × amount_mult × time_mult
let temp = base_amount
    .fixed_mul_floor(amount_mult, SCALAR_7)
    .expect("amount multiplier overflow");
let result = temp
    .fixed_mul_floor(time_mult, SCALAR_7)
    .expect("time multiplier overflow");
```

## Critical Invariants

The contract MUST maintain these invariants at all times:

1. **FP Conservation**: `sum(all_players.available_fp + locked_fp) = total_fp_in_system`
2. **Balance Consistency**: FP calculated from vault balances at epoch boundaries
   - `EpochPlayer.initial_balance` matches vault balance at first game of epoch
   - Players may deposit/withdraw mid-epoch without FP recalculation
3. **Faction Immutability**: Once locked in epoch, faction cannot change
4. **Reward Distribution**: `sum(claimed_rewards) <= epoch.reward_pool`
5. **Session Uniqueness**: Each `session_id` is unique and consumed after game end
6. **Cross-Epoch Reset**: >50% net withdrawal between epochs triggers time multiplier reset

## Security Considerations

- **Flash Deposit Attack**: Mitigated by time multiplier (starts at 1.0x)
- **Epoch Boundary Gaming**: Cross-epoch comparison allows timing attacks, accepted trade-off
  - Players can time deposits/withdrawals around epoch boundaries
  - FP remains valid for entire epoch even after mid-epoch withdrawals
  - Design prioritizes sustained balances over micro-management
- **Faction Switching**: Faction locks on first game of epoch
- **Integer Overflow**: Use checked arithmetic everywhere
- **Replay Attacks**: Session IDs are unique and single-use
- **Oracle Trust**: Multi-sig oracle for Phase 1-2, migrate to ZK proofs later
- **Direct Vault Interaction**: Players who deposit/withdraw via vault directly (bypassing UI)
  - Balance correctly tracked via queries at first game
  - No security issue, just unconventional UX

## Bun-Specific Patterns

This project uses **Bun** (NOT Node.js, npm, yarn, or pnpm):

```bash
# Run TypeScript directly
bun index.ts

# Test runner
bun test

# Install packages
bun install

# Run scripts
bun run <script>
```

Bun automatically:
- Loads `.env` files (no dotenv needed)
- Transpiles TypeScript
- Bundles with `bun build`
- Provides built-in WebSocket support

## TypeScript Contract Integration

Generate type-safe bindings after building the contract:

```bash
stellar contract bindings typescript \
  --wasm target/wasm32v1-none/release/ohloss.wasm \
  --output-dir ./bindings/ohloss \
  --contract-id <CONTRACT_ID>
```

Use the generated bindings:

```typescript
import { Contract } from './bindings/ohloss';

const contract = new Contract({
  contractId: 'C...',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  rpcUrl: 'https://rpc.lightsail.network',
});

// Type-safe contract calls
const player = await contract.get_player({ player: userAddress });
const epochPlayer = await contract.get_epoch_player({ player: userAddress, epoch: 1 });
```

## Implementation Status

**Current state: Live on Mainnet**

### Completed
- Contract initialization and admin functions
- Fee-vault integration (players deposit directly to fee-vault-v2)
- Faction selection and epoch locking
- FP calculation with asymptotic multipliers
- Game registry (add/remove/is_game)
- Game lifecycle (start/end with multi-sig authorization)
- Epoch cycling with BLND → USDC conversion
- Reward distribution and claiming
- Emergency pause mechanism
- TTL storage management

### In Progress
- Security audit (external)
- Multiplier system optimization (see fp_simulations/RECOMMENDATIONS.md)

## MCP Tools and Research Workflow

**PREFER MCP tools over manual searching** when researching dependencies, finding patterns, or understanding external contracts.

### Key MCP Tools

#### context7 - Library documentation
**Use when:** Understanding library APIs, getting code examples

```bash
# Find library ID
context7: resolve-library-id("stellar-sdk")

# Get documentation with code examples
context7: get-library-docs("/stellar/js-stellar-sdk", topic="contract", mode="code")

# Get conceptual/architectural info
context7: get-library-docs("/stellar/js-stellar-sdk", mode="info")
```

#### github - Read external contract source code
**Use when:** Understanding fee-vault-v2, Soroswap, or any GitHub repository

**Key operations:**
- `get_file_contents("script3", "fee-vault-v2", "src/vault.rs")` - Read specific files
- `search_code("soroban-sdk Map usage language:rust")` - Find code patterns
- `list_commits("script3", "fee-vault-v2")` - Check recent changes

**Examples:**
- "How does fee-vault handle deposits?" → Read the source file
- "Find examples of cross-contract calls" → Search Stellar repos

#### deepwiki - Ask questions about repositories
**Use when:** You need high-level understanding of a repository's architecture

**Examples:**
- `ask_question("script3/fee-vault-v2", "How do I integrate with a Blend pool?")`
- `ask_question("soroswap/core", "What's the swap flow and required parameters?")`

#### perplexity - Research and troubleshooting
**Use when:** Looking for recent updates, best practices, or debugging

**Examples:**
- `search("soroban-sdk 23.1 breaking changes 2025")`
- `reason("What are the best practices for Soroban storage optimization?")`

#### cloudflare - Cloudflare documentation
**Use when:** Deploying frontend-v2 or api-worker to Cloudflare

```bash
cloudflare: search_cloudflare_documentation("workers vite deployment")
```

### Task Agents

**Use Task agents for complex, multi-step operations** instead of manual tool chaining.

#### Explore Agent
**When to use:** Multi-file searches, pattern finding, understanding unfamiliar codebases

**Thoroughness levels:**
- `quick` - Basic keyword search
- `medium` - Moderate exploration (recommended default)
- `very thorough` - Comprehensive analysis across multiple files

#### General Purpose Agent
**When to use:** Complex research requiring multiple tools, code generation

#### Plan Agent
**When to use:** Breaking down features before implementation

### Decision Guide: Which Tool to Use?

| Task | Primary Tool | Secondary Tool |
|------|-------------|----------------|
| Library documentation | context7 | github |
| Studying fee-vault-v2 source | github | deepwiki |
| Finding code patterns | Explore agent | github search_code |
| Latest Soroban best practices | perplexity | WebSearch |
| Complex multi-step research | General Purpose agent | perplexity |
| Architecture questions | deepwiki | github |
| Cloudflare deployment | cloudflare | - |

### Key Repositories for Reference

- **stellar/js-stellar-sdk** - TypeScript SDK
- **stellar/soroban-examples** - Official example contracts
- **script3/fee-vault-v2** - Vault integration patterns
- **soroswap/core** - DEX integration reference
- **kalepail/soroban-fixed-point-math** - Safe arithmetic patterns

## Key Documentation

- Detailed technical plan: `docs/PLAN.md`
- Tooling reference: `AGENTS.md` (root)
- Original requirements: `docs/OG_PLAN.md`
- Security audit: `docs/SECURITY_AUDIT.md`
- Production readiness: `docs/PRODUCTION_READINESS.md`
- Contract addresses: `CHITSHEET.md` (root)

## Important Notes

- See docs/PLAN.md for complete contract method specifications and data structures
- All FP calculations use 7-decimal fixed-point math (SCALAR_7 = 10_000_000)
- Game outcome verification is oracle-based initially, will migrate to ZK proofs
- Epoch duration is configurable but defaults to 4 days (345,600 seconds)
- USDC uses 7 decimals on Stellar (NOT 6 like on Ethereum)
