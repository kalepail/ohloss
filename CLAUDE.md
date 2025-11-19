# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Blendizzard is a faction-based competitive gaming protocol on Stellar's Soroban platform. Players deposit assets into a yield-generating vault (via Blend protocol), earn faction points based on deposit amount and time, and compete in games by wagering these points. Every 4-day epoch, the winning faction shares the accumulated yield (BLND converted to USDC).

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
WebSearch("soroban-sdk latest release 2025")

# 2. Check if crate is compatible
rust-docs: cache_crate_from_cratesio("package-name", "version")

# 3. Review documentation
rust-docs: structure("package-name", "version")

# 4. Check for examples
github: search_code("package-name soroban language:rust")
```

## Build and Test Commands

### Rust Contract

**Important:** Use `wasm32v1-none` target (Rust 1.84.0+) for stability. This locks to WebAssembly 1.0 features and prevents breaking changes from Rust updates.

```bash
# Install the wasm32v1-none target (one-time setup)
rustup target add wasm32v1-none

# Build the contract (RECOMMENDED - uses stellar CLI)
cd contracts/blendizzard
stellar contract build

# Output location: target/wasm32v1-none/release/blendizzard.wasm

# Alternative: Manual build with cargo
cargo build --target wasm32v1-none --release

# Run Rust unit tests
cargo test

# Optimize WASM (usually not needed - stellar contract build optimizes automatically)
stellar contract optimize --wasm target/wasm32v1-none/release/blendizzard.wasm
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
  --wasm ../contracts/blendizzard/target/wasm32v1-none/release/blendizzard.wasm \
  --output-dir ./bindings/blendizzard \
  --contract-id <CONTRACT_ID>
```

### Deployment

```bash
# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/blendizzard.wasm \
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

**Key Design Principle**: Players interact directly with fee-vault-v2 for deposits/withdrawals. Blendizzard queries balances and enforces game rules at epoch boundaries.

**Flow:**
1. Player deposits to fee-vault-v2 directly (no intermediate Blendizzard deposit call)
2. Player plays first game of Epoch N → Blendizzard queries vault balance
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
contracts/blendizzard/src/
├── lib.rs              # Main contract entry point
├── types.rs            # Shared data structures and enums
├── test.rs             # Integration tests
└── [modules]
    ├── storage.rs      # Storage utilities
    ├── vault.rs        # Vault balance queries and cross-epoch comparison
    ├── faction.rs      # Faction management
    ├── faction_points.rs  # FP calculation with multipliers
    ├── game.rs         # Game lifecycle (start/end) with epoch initialization
    ├── epoch.rs        # Epoch cycling and management
    ├── rewards.rs      # Reward distribution
    ├── events.rs       # Event definitions
    └── errors.rs       # Error definitions
```

**Note**: `vault.rs` no longer contains deposit/withdraw methods. It provides:
- `get_vault_balance()` - Query player balance from fee-vault-v2
- `check_cross_epoch_withdrawal_reset()` - Compare balances between epochs

### External Dependencies

The contract integrates with three external Soroban contracts:

1. **fee-vault-v2** (https://github.com/script3/fee-vault-v2)
   - Yield-generating vault for BLND token
   - **Players interact directly**: Call `deposit()` and `withdraw()` on fee-vault-v2
   - **Blendizzard queries balances**: `get_underlying_tokens(player)` at first game of epoch
   - **Admin role**: Blendizzard withdraws accumulated fees via `admin_withdraw()`

2. **Soroswap Router** (https://github.com/soroswap/core)
   - DEX for BLND → USDC conversion during epoch cycling
   - Method: `swap_exact_tokens_for_tokens()`

3. **soroban-fixed-point-math** (https://github.com/script3/soroban-fixed-point-math)
   - Safe fixed-point arithmetic library
   - Methods: `fixed_mul_floor()`, `fixed_mul_ceil()`, `fixed_div_floor()`

### Data Structures

Key storage types (defined in contracts/blendizzard/src/types.rs):

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
  --wasm target/wasm32v1-none/release/blendizzard.wasm \
  --output-dir ./bindings/blendizzard \
  --contract-id <CONTRACT_ID>
```

Use the generated bindings:

```typescript
import { Contract } from './bindings/blendizzard';

const contract = new Contract({
  contractId: 'C...',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

// Type-safe contract calls
await contract.deposit({
  player: userAddress,
  amount: BigInt(1000_0000000), // 1000 USDC (7 decimals)
});
```

## Implementation Phases

Current phase: **Phase 1 - Core MVP**

### Phase 1 Checklist (Weeks 1-3)
- [ ] Contract initialization and admin functions
- [ ] Vault deposit/withdraw integration (no multipliers)
- [ ] Faction selection (persistent only)
- [ ] Basic FP calculation (1:1 with deposit)
- [ ] Game registry (add/remove/is_game)
- [ ] Simple game lifecycle (start/end with oracle verification)
- [ ] Manual epoch cycling (admin-triggered)
- [ ] Basic tests for all functions

### Phase 2 (Weeks 4-6)
- Full multiplier implementation
- Deposit reset logic
- Epoch faction locking
- BLND → USDC conversion
- Reward claiming

### Phase 3 (Weeks 7-8)
- Gas optimization
- Emergency pause mechanism
- Security audit
- Production deployment

## MCP Tools and Research Workflow

**PREFER MCP tools over manual searching** when researching dependencies, finding patterns, or understanding external contracts.

### Key MCP Tools

#### rust-docs - Primary tool for Rust/Soroban API research
**Use when:** Understanding soroban-sdk APIs, soroban-fixed-point-math, or any Rust crate

**Common workflow:**
```bash
# 1. Cache the crate (only needed once)
cache_crate_from_cratesio("soroban-sdk", "23.1.0")
cache_crate_from_cratesio("soroban-fixed-point-math", "1.3.0")

# 2. Get high-level structure
structure("soroban-sdk", "23.1.0")

# 3. Search for items (lightweight preview)
search_items_preview("soroban-sdk", "23.1.0", "Map")

# 4. Get full details for specific items
get_item_details("soroban-sdk", "23.1.0", <item_id>)

# 5. View source code examples
get_item_source("soroban-sdk", "23.1.0", <item_id>)
```

**Examples:**
- "How does `Map::set()` work?" → Use rust-docs
- "What are the parameters for `fixed_mul_floor()`?" → Use rust-docs
- "How do I create a `Symbol`?" → Use rust-docs

#### github - Read external contract source code
**Use when:** Understanding fee-vault-v2, Soroswap, or any GitHub repository

**Key operations:**
- `get_file_contents("script3", "fee-vault-v2", "src/vault.rs")` - Read specific files
- `search_code("soroban-sdk Map usage language:rust")` - Find code patterns
- `list_commits("script3", "fee-vault-v2")` - Check recent changes
- `search_repositories("stellar soroban examples")` - Find example projects

**Examples:**
- "How does fee-vault handle deposits?" → Read the source file
- "Find examples of cross-contract calls" → Search Stellar repos
- "What methods does Soroswap router expose?" → Read interface file

#### deepwiki - Ask questions about repositories
**Use when:** You need high-level understanding of a repository's architecture

**Examples:**
- `ask_question("script3/fee-vault-v2", "How do I integrate with a Blend pool?")`
- `ask_question("soroswap/core", "What's the swap flow and required parameters?")`
- `read_wiki_structure("stellar/soroban-examples")` - See available topics

#### WebSearch - Find latest documentation and discussions
**Use when:** Looking for recent updates, best practices, or community discussions

**Examples:**
- "Soroban smart contract storage optimization 2025"
- "soroban-sdk 23.1 release notes"
- "Stellar Soroban upgrade patterns"

### Task Agents

**Use Task agents for complex, multi-step operations** instead of manual tool chaining.

#### Explore Agent
**When to use:** Multi-file searches, pattern finding, understanding unfamiliar codebases

**Thoroughness levels:**
- `quick` - Basic keyword search
- `medium` - Moderate exploration (recommended default)
- `very thorough` - Comprehensive analysis across multiple files

**Examples:**
- "Find how fee-vault-v2 handles admin withdrawals" (medium)
- "Search for all fixed-point math usage in soroban-examples" (quick)
- "Understand the complete Soroswap swap flow" (very thorough)

#### General Purpose Agent
**When to use:** Complex research requiring multiple tools, code generation

**Examples:**
- "Research and implement a Soroban contract upgrade mechanism"
- "Find all examples of Map usage in Stellar contracts and generate test cases"
- "Analyze security patterns in fee-vault-v2 and apply to our contract"

#### Plan Agent
**When to use:** Breaking down features before implementation

**Examples:**
- "Plan implementation of faction points multiplier calculation"
- "Design the epoch cycling workflow with all edge cases"

### Decision Guide: Which Tool to Use?

| Task | Primary Tool | Secondary Tool |
|------|-------------|----------------|
| Understanding soroban-sdk API | rust-docs | github (examples) |
| Studying fee-vault-v2 source | github | deepwiki |
| Finding code patterns across repos | Explore agent | github search_code |
| Latest Soroban best practices | WebSearch | WebFetch |
| Complex multi-step research | General Purpose agent | - |
| API method signatures | rust-docs | - |
| Architecture questions | deepwiki | github |

### Recommended Workflows

#### Starting with External Dependencies
```
1. rust-docs: cache_crate_from_cratesio("soroban-sdk", "23.1.0")
2. rust-docs: structure("soroban-sdk", "23.1.0")
3. github: get_file_contents("script3", "fee-vault-v2", "README.md")
4. deepwiki: ask_question("script3/fee-vault-v2", "What are the key integration points?")
```

#### Implementing a New Feature
```
1. Plan agent: "Plan implementation of [feature]"
2. rust-docs: search_items_preview for relevant SDK methods
3. Explore agent: "Find examples of [pattern] in soroban-examples" (medium)
4. github search_code: Find real-world usage examples
5. Implement with guidance from research
```

#### Debugging or Understanding Complex Code
```
1. Explore agent: "Find where [functionality] is implemented" (very thorough)
2. github: get_file_contents to read specific implementations
3. rust-docs: get_item_details for API documentation
4. WebSearch: Search for known issues or discussions
```

### Key Repositories for Reference

- **stellar/soroban-sdk** - Core SDK and examples
- **stellar/soroban-examples** - Official example contracts
- **script3/fee-vault-v2** - Vault integration patterns
- **soroswap/core** - DEX integration reference
- **script3/soroban-fixed-point-math** - Safe arithmetic patterns

## Key Documentation

- Detailed technical plan: `docs/PLAN.md`
- Tooling reference: `docs/AGENTS.md`
- Original requirements: `docs/OG_PLAN.md`
- Security audit: `docs/SECURITY_AUDIT.md`
- Production readiness: `docs/PRODUCTION_READINESS.md`

## Important Notes

- See docs/PLAN.md for complete contract method specifications and data structures
- All FP calculations use 7-decimal fixed-point math (SCALAR_7 = 10_000_000)
- Game outcome verification is oracle-based initially, will migrate to ZK proofs
- Epoch duration is configurable but defaults to 4 days (345,600 seconds)
- USDC uses 7 decimals on Stellar (NOT 6 like on Ethereum)
