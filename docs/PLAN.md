# Blendizzard - Technical Plan

## ⚠️ Architecture Update: Cross-Epoch Balance Tracking

**Implemented**: December 2024

This document reflects the **cross-epoch balance tracking architecture**:
- Users deposit/withdraw directly to fee-vault-v2 (no intermediate Blendizzard calls)
- Balances queried from vault at first game of each epoch
- FP calculated once per epoch and remains valid until next epoch
- 50% withdrawal rule enforced via cross-epoch comparison (not within-epoch)

See `CLAUDE.md` for detailed architectural explanation.

---

## Executive Summary

Blendizzard is a faction-based competitive gaming protocol on Stellar's Soroban platform that combines DeFi yield generation with gaming mechanics. Players deposit assets into a yield-generating vault (via Blend protocol), earn faction points (fp) based on their deposit amount and time, and compete in games by wagering these points. Every 4-day epoch, the winning faction shares the accumulated yield (BLND converted to USDC).

## Core Concepts

### Factions (3)
- **WholeNoodle** (ID: 0)
- **PointyStick** (ID: 1)
- **SpecialRock** (ID: 2)

### Epoch System
- **Duration:** 4 days (345,600 seconds)
- **Cycle Process:**
  1. Close current epoch
  2. Determine winning faction (highest total fp contributed)
  3. Withdraw accumulated BLND from fee-vault admin balance
  4. Convert BLND → USDC via Soroswap
  5. Distribute USDC proportionally to winning faction contributors
  6. Open next epoch

### Faction Points (fp) Mechanics

Players have a per-epoch amount of faction points calculated as:

```
fp = base_deposit_amount × amount_multiplier(deposit_amount) × time_multiplier(time_held)
```

#### Amount Multiplier
- Asymptotic curve toward bonus at **$1,000 USD**
- Formula (using fixed-point math):
```rust
// Example formula (adjust curve parameters as needed)
// Using 7 decimal fixed point (e.g., 1.0 = 10_000_000)
let amount_usd = get_deposit_value_usd(user_deposit);
let max_amount = 1000_0000000; // $1,000 in 7 decimals
let multiplier = FIXED_POINT_ONE + ((amount_usd * FIXED_POINT_ONE) / (amount_usd + max_amount));
// Results in 1.0x at $0, ~1.5x at $1k, ~1.75x at $3k, ~1.9x at $9k
```

#### Time Multiplier
- Asymptotic curve toward bonus at **30 days**
- Formula:
```rust
let time_held_seconds = current_time - deposit_timestamp;
let max_time = 30 * 24 * 60 * 60; // 30 days in seconds
let multiplier = FIXED_POINT_ONE + ((time_held_seconds * FIXED_POINT_ONE) / (time_held_seconds + max_time));
// Results in 1.0x at 0 days, ~1.5x at 30 days, ~1.67x at 60 days
```

**Note:** Actual curve parameters should be tuned during testing for game balance.

#### Deposit Reset Rule (Cross-Epoch)
- Net withdrawal > 50% between epochs → resets time deposited to 0
- Check: `last_epoch_balance - current_balance > (last_epoch_balance / 2)`
- Prevents gaming the system by maintaining sustained commitment across epochs

## Smart Contract Architecture

### External Dependencies

#### 1. fee-vault-v2
**Purpose:** Yield-generating vault for BLND token
**GitHub:** https://github.com/script3/fee-vault-v2

**Key Functions Used:**
```rust
// Deposit underlying assets, receive shares
deposit(user: Address, amount: i128) -> i128

// Withdraw underlying assets, burn shares
withdraw(user: Address, amount: i128) -> i128

// Get user's underlying token balance
get_underlying_tokens(user: Address) -> i128

// Admin: withdraw accumulated fees (BLND)
admin_withdraw(amount: i128) -> i128

// Admin: get admin's fee balance
get_underlying_admin_balance() -> i128
```

**Integration Pattern:**
- Users deposit/withdraw directly to fee-vault-v2 (no Blendizzard intermediation)
- Blendizzard queries user balances via `get_underlying_tokens()` at game start
- Admin of fee-vault is set to Blendizzard contract
- Blendizzard can withdraw admin fees during epoch cycling via `admin_withdraw()`

#### 2. Soroswap Router
**Purpose:** DEX for BLND → USDC conversion
**GitHub:** https://github.com/soroswap/core

**Key Function Used:**
```rust
// Swap exact input for minimum output
swap_exact_tokens_for_tokens(
    amount_in: i128,
    amount_out_min: i128,
    path: Vec<Address>,  // [BLND_ADDRESS, USDC_ADDRESS]
    to: Address,
    deadline: u64
) -> Vec<i128>
```

**Integration Pattern:**
```rust
// During cycle_epoch:
let blnd_balance = fee_vault.admin_withdraw(available_blnd);
let path = vec![&env, blnd_token, usdc_token];
let deadline = env.ledger().timestamp() + 300; // 5 min deadline
let amounts = soroswap_router.swap_exact_tokens_for_tokens(
    blnd_balance,
    0, // Accept any amount (or calculate min with slippage)
    path,
    contract_address, // Send USDC to this contract
    deadline
);
// amounts[1] = USDC received, store for reward distribution
```

#### 3. soroban-fixed-point-math
**Purpose:** Safe fixed-point arithmetic
**GitHub:** https://github.com/script3/soroban-fixed-point-math

**Key Functions:**
```rust
use soroban_fixed_point_math::FixedPoint;

// Multiply with floor rounding
amount.fixed_mul_floor(multiplier, SCALAR)

// Multiply with ceiling rounding
amount.fixed_mul_ceil(multiplier, SCALAR)

// Divide with floor rounding
amount.fixed_div_floor(divisor, SCALAR)
```

**Usage Example:**
```rust
const SCALAR_7: i128 = 10_000_000; // 7 decimal places

fn calculate_fp(base_amount: i128, amount_mult: i128, time_mult: i128) -> i128 {
    let temp = base_amount
        .fixed_mul_floor(amount_mult, SCALAR_7)
        .expect("amount multiplier overflow");
    temp.fixed_mul_floor(time_mult, SCALAR_7)
        .expect("time multiplier overflow")
}
```

### Core Contract Methods

#### Game Registry

```rust
/// Add a game contract to the approved list (admin only)
fn add_game(e: Env, id: Address)

/// Remove a game contract from the approved list (admin only)
fn remove_game(e: Env, id: Address)

/// Check if a contract is an approved game
fn is_game(e: Env, id: Address) -> bool
```

#### Vault Integration (Query-Based)

**ARCHITECTURE CHANGE**: Deposit/withdraw methods have been removed. Users interact directly with fee-vault-v2.

Blendizzard queries balances from vault when needed:
- At first game of each epoch: queries `get_underlying_tokens()` to calculate FP
- Cross-epoch comparison: checks if net withdrawal >50% to trigger time reset
- Reward distribution: admin withdraws accumulated BLND via `admin_withdraw()`

No explicit deposit/withdraw APIs exposed by Blendizzard contract.

#### Faction Selection

```rust
/// Allow the user to select a faction
/// This should go to a persistent user entry so it persists across epochs
/// Do not allow a user to select a faction after the epoch has started unless
/// it is their first action for the epoch (hasn't played any games yet)
/// This means we both track a per user and a per epoch faction
/// This might mean the easier thing to do will be to allow this method to be
/// called at any time but once the first game for the user is played they lock
/// in their epoch faction at that time
fn select_faction(e: Env, user: Address, faction: u32)
```

#### Player Queries

```rust
/// Get player information
/// Returns: selected faction, last epoch balance, deposit timestamp
fn get_player(e: Env, user: Address) -> PlayerInfo

/// Get player's epoch-specific information
/// Returns: epoch faction, initial balance, available fp, locked fp, total fp contributed
fn get_epoch_player(e: Env, user: Address) -> EpochPlayerInfo
```

#### Game Lifecycle

```rust
/// Start a new game session
/// When a game starts there's actually quite a bit that needs to be recorded:
/// - If it's the players first game for the epoch we need to lock in their total
///   available factions points for the epoch
/// - Lock in the user's faction if it hasn't been elected yet via `select_faction`
fn start_game(
    e: Env,
    game_id: Address,
    session_id: BytesN<32>,
    player1: Address,
    player2: Address,
    player1_wager: i128,
    player2_wager: i128,
)

/// End a game session with outcome verification
/// Requires risc0 or noir proof
/// Output: game_id, session_id, player 1 address, player 2 address,
///         winner (true for player 1, false for player 2)
fn end_game(
    e: Env,
    game_id: Address,
    session_id: BytesN<32>,
    proof: Bytes,
    outcome: GameOutcome,
)
```

**FP Spending Mechanics:**

When a game ends:
1. **Both players' wagers are spent/burned** - FP is consumed and removed from circulation
2. **Only the winner's wager contributes to faction standings** - This determines the winning faction at epoch end
3. **Loser's wager vanishes** - It doesn't go to the winner or contribute to any faction
4. **Winner gains no FP** - The reward is the contribution to their faction's score

This creates a zero-sum, resource-scarce environment where:
- Every game reduces total available FP
- Strategic wager sizing matters (risk vs. faction contribution)
- Only successful players contribute to faction victory
- FP scarcity increases as epoch progresses

**Implementation Details:**
```rust
// Both players: Remove wager from locked_fp (spend/burn)
winner_epoch.locked_fp -= winner_wager;
loser_epoch.locked_fp -= loser_wager;

// Only winner: Add wager to total_fp_contributed
winner_epoch.total_fp_contributed += winner_wager;

// Update faction standings with winner's contribution
faction_standings[winner_faction] += winner_wager;
```

#### Epoch Management

```rust
/// Get the current epoch if no number specified, otherwise the specified number
/// Return the epoch number and faction standings
fn get_epoch(e: Env, epoch: Option<u32>) -> EpochInfo

/// Close current epoch, decide faction winner for closed epoch, lock in claimable
/// rewards by contributed faction points, open next epoch
fn cycle_epoch(e: Env) -> u32
```

#### Reward Claims

```rust
/// Claim the epoch winnings/yield for a user for a specific epoch
fn claim_yield(e: Env, user: Address, epoch: u32) -> i128
```

#### Admin Functions

```rust
/// Initialize the contract, set default global variables including the admin
fn __constructor(
    e: Env,
    admin: Address,
    fee_vault: Address,
    soroswap_router: Address,
    blnd_token: Address,
    usdc_token: Address,
    epoch_duration: u64,
)

/// Update the admin address
fn set_admin(e: Env, new_admin: Address)

/// Return the admin address
fn get_admin(e: Env) -> Address

/// Optionally update any global variables
fn update(e: Env, /* params TBD */)

/// Update the contract hash
fn upgrade(e: Env, new_wasm_hash: BytesN<32>)
```

## Data Structures

### Storage Types

```rust
/// Persistent user data (across all epochs)
#[contracttype]
pub struct User {
    pub selected_faction: u32,
    pub deposit_timestamp: u64,
    pub last_epoch_balance: i128,  // For cross-epoch withdrawal comparison
}

/// Per-epoch user data
#[contracttype]
pub struct EpochUser {
    pub epoch_faction: Option<u32>,
    pub initial_balance: i128,  // Balance at first game of epoch
    pub available_fp: i128,
    pub locked_fp: i128,
    pub total_fp_contributed: i128,
}

/// Epoch metadata
#[contracttype]
pub struct EpochInfo {
    pub epoch_number: u32,
    pub start_time: u64,
    pub end_time: u64,
    pub faction_standings: Map<u32, i128>,
    pub reward_pool: i128,
    pub winning_faction: Option<u32>,
    pub is_finalized: bool,
}

/// Game session tracking
#[contracttype]
pub struct GameSession {
    pub game_id: Address,
    pub session_id: BytesN<32>,
    pub player1: Address,
    pub player2: Address,
    pub player1_wager: i128,
    pub player2_wager: i128,
    pub player1_faction: u32,
    pub player2_faction: u32,
    pub status: GameStatus,
    pub winner: Option<bool>,
    pub created_at: u64,
}

#[contracttype]
pub enum GameStatus {
    Pending,
    Completed,
    Cancelled,
}

/// Game outcome for verification
#[contracttype]
pub struct GameOutcome {
    pub game_id: Address,
    pub session_id: BytesN<32>,
    pub player1: Address,
    pub player2: Address,
    pub winner: bool, // true = player1, false = player 2
}

/// Player info returned by get_player
#[contracttype]
pub struct PlayerInfo {
    pub selected_faction: u32,
    pub deposit_timestamp: u64,
    pub last_epoch_balance: i128,
}

/// Player epoch info returned by get_epoch_player
#[contracttype]
pub struct EpochPlayerInfo {
    pub epoch_faction: Option<u32>,
    pub initial_balance: i128,
    pub available_fp: i128,
    pub locked_fp: i128,
    pub total_fp_contributed: i128,
}
```

### Storage Keys

```rust
// Singleton keys
const ADMIN: Symbol = symbol_short!("ADMIN");
const CONFIG: Symbol = symbol_short!("CONFIG");
const CUR_EPOCH: Symbol = symbol_short!("CUR_EPOCH");

// Composite keys (using tuples or nested structures)
// User(user_address) -> User
// EpochUser(epoch_number, user_address) -> EpochUser
// Epoch(epoch_number) -> EpochInfo
// Session(session_id) -> GameSession
// Game(game_address) -> bool
// Claimed(user_address, epoch_number) -> bool
```

## Error Definitions

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // Admin errors
    NotAdmin = 1,
    AlreadyInitialized = 2,

    // User errors
    InsufficientBalance = 10,
    InsufficientFactionPoints = 11,
    InvalidAmount = 12,
    InvalidFaction = 13,
    FactionAlreadyLocked = 14,

    // Game errors
    GameNotWhitelisted = 20,
    SessionNotFound = 21,
    SessionAlreadyExists = 22,
    InvalidSessionState = 23,
    InvalidGameOutcome = 24,
    ProofVerificationFailed = 25,

    // Epoch errors
    EpochNotFinalized = 30,
    EpochAlreadyFinalized = 31,
    EpochNotReady = 32,

    // Reward errors
    NoRewardsAvailable = 40,
    RewardAlreadyClaimed = 41,
    NotWinningFaction = 42,

    // External contract errors
    FeeVaultError = 50,
    SwapError = 51,
    TokenTransferError = 52,

    // Math errors
    OverflowError = 60,
    DivisionByZero = 61,
}
```

## Implementation Phases

### Phase 1: Core MVP (Weeks 1-3)
**Goal:** Minimal viable product with basic functionality

**Deliverables:**
- [x] Contract initialization and admin functions
- [x] ~~Vault deposit/withdraw integration~~ → Changed to query-based balance retrieval
- [x] Faction selection (persistent only)
- [x] Basic FP calculation with multipliers (using cross-epoch model)
- [x] Game registry (add/remove/is_game)
- [x] Simple game lifecycle (start/end with oracle verification)
- [ ] Manual epoch cycling (admin-triggered)
- [ ] Comprehensive tests for all functions

**Testing Focus:**
- Unit tests for each function
- Integration test: full user journey
- Security: basic invariant checks

### Phase 2: Full Features (Weeks 4-6)
**Goal:** Complete feature set with proper economics

**Deliverables:**
- [x] Implement amount and time multipliers
- [x] Cross-epoch withdrawal reset logic (>50% net withdrawal)
- [x] Epoch faction locking (on first game)
- [ ] BLND → USDC conversion via Soroswap
- [ ] Reward calculation and claiming
- [ ] Automatic epoch cycling capability
- [x] Comprehensive event emissions
- [ ] Storage optimization

**Testing Focus:**
- Multiplier curve validation
- Reward distribution accuracy
- Epoch boundary conditions
- Slippage handling in swaps

### Phase 3: Production Hardening (Weeks 7-8)
**Goal:** Production-ready contract with security and optimizations

**Deliverables:**
- [ ] Gas optimization pass
- [ ] Emergency pause mechanism
- [ ] Comprehensive error handling
- [ ] Reentrancy guards where needed
- [ ] External security audit
- [ ] Mainnet deployment scripts
- [ ] Monitoring and alerting setup

**Testing Focus:**
- Fuzzing for edge cases
- Load testing (many users/games)
- Upgrade testing
- Failure mode analysis

### Phase 4: Advanced Features (Future)
**Goal:** Enhanced capabilities and integrations

**Potential Features:**
- [ ] ZK proof verification (risc0/noir) when WASM verifier ready
- [ ] Multiple vault support (different assets)
- [ ] Additional game mechanics
- [ ] Governance for parameter adjustments

## Security Considerations

### Critical Invariants

1. **FP Conservation:**
   ```rust
   total_fp_in_system = sum(all users: available_fp + locked_fp)
   ```

2. **Balance Queries:**
   ```rust
   // Balances are always queried from fee-vault-v2, no local tracking
   user_balance = fee_vault.get_underlying_tokens(user_address)
   ```

3. **Faction Immutability:**
   ```rust
   if user.epoch_faction.is_some() {
       assert!(user cannot change faction this epoch)
   }
   ```

4. **Reward Distribution:**
   ```rust
   sum(all_rewards_claimed) <= epoch.reward_pool
   ```

5. **Game Session Uniqueness:**
   ```rust
   session_id must be unique across all games/epochs
   ```

### Attack Vectors & Mitigations

#### 1. Flash Deposit Attack
**Threat:** User deposits large amount just before epoch end to gain fp
**Mitigation:** Time multiplier starts at 1.0x, takes 30 days to reach ~1.5x

#### 2. Epoch Boundary Manipulation
**Threat:** User times deposits/withdrawals around epoch boundaries
**Mitigation:**
- Snapshot fp at first game start in epoch (balance remains valid for entire epoch)
- Cross-epoch reset penalty: >50% net withdrawal between epochs resets time multiplier
- FP remains valid even if user withdraws during epoch (epoch-based model)

#### 3. Faction Switching Exploits
**Threat:** User switches faction mid-epoch to be on winning side
**Mitigation:** Faction locks on first game start, cannot change

#### 4. Reward Calculation Errors
**Threat:** Integer overflow in reward math
**Mitigation:** Use checked arithmetic and fixed-point math library

#### 5. Replay Attacks
**Threat:** Reuse game outcome to claim multiple wins
**Mitigation:** Session IDs are unique and consumed after game ends

#### 6. Oracle Manipulation (Phase 1-2)
**Threat:** Compromised oracle approves false game outcomes
**Mitigation:**
- Multi-sig oracle initially
- Migrate to ZK proofs in Phase 4
- Game timeout mechanism (TBD)

### Audit Checklist

- [ ] All arithmetic uses checked operations or fixed-point math
- [ ] All storage writes have corresponding reads validation
- [ ] No unbounded loops or recursion
- [ ] All external calls have reentrancy protection
- [ ] All user inputs are validated
- [ ] All admin functions have access control
- [ ] Time-dependent logic handles edge cases
- [ ] Storage keys cannot collide
- [ ] Events emitted for all state changes
- [ ] Upgrade mechanism is secure

## Open Questions & Future Decisions

### 1. Oracle Selection for USD Pricing
**Question:** How to price deposits in USD for amount multiplier?

**Options:**
- A. Use stablecoin (USDC/USDT) only - simplest
- B. Oracle for any asset (Chainlink-style)
- C. DEX TWAP (Soroswap)

**Recommendation:** Start with option A (USDC only)

### 2. ZK Proof Integration Timeline
**Question:** When can we integrate risc0/noir?

**Status:** WASM verifier not yet available on Soroban

**Plan:**
- Phase 1-2: Trusted multi-sig oracle
- Phase 3: Monitor risc0/noir progress
- Phase 4: Migrate to ZK proofs when ready

### 3. Game Timeout Handling
**Question:** What happens if a game never ends?

**Considerations:**
- Need timeout mechanism to return wagers
- Who can trigger timeout?
- How long should timeout be?

**Status:** TBD during implementation

### 4. Update Function Parameters
**Question:** What parameters should `update()` accept?

**Status:** Will be defined based on what needs to be configurable (epoch duration, multiplier caps, slippage tolerance, etc.)

## Dependencies

```toml
[dependencies]
soroban-sdk = "22.0.8"  # Latest as of Nov 2025
soroban-fixed-point-math = "1.3.0"

[dev-dependencies]
soroban-sdk = { version = "22.0.8", features = ["testutils"] }
```

## Best Practices

### Soroban-Specific Optimizations
- Use `#![no_std]` throughout
- Use `Symbol` instead of `String` for identifiers
- Use references (`&env`) to avoid cloning
- Use `BytesN<32>` for fixed-size data
- Prefer `Map` for lookups over `Vec` scans
- Use `soroban-fixed-point-math` for all multiplier calculations
- Minimize cross-contract calls

### Storage Considerations
- Use compact types where possible
- Extend TTL only for persistent data
- Clear old epoch data if needed

### Security
- Use checked arithmetic everywhere
- Validate all user inputs
- Emit events for all state changes
- Implement reentrancy guards for external calls

## Contract Structure

```
blendizzard/
├── contracts/
│   └── blendizzard/
│       ├── src/
│       │   ├── lib.rs              # Main contract entry
│       │   ├── storage.rs          # Storage utilities
│       │   ├── types.rs            # Shared types
│       │   ├── vault.rs            # Vault operations
│       │   ├── faction.rs          # Faction management
│       │   ├── faction_points.rs   # FP calculation
│       │   ├── game.rs             # Game lifecycle
│       │   ├── epoch.rs            # Epoch management
│       │   ├── rewards.rs          # Reward distribution
│       │   ├── events.rs           # Event emissions
│       │   ├── errors.rs           # Error definitions
│       │   └── tests/
│       │       ├── mod.rs
│       │       ├── vault_tests.rs
│       │       ├── faction_tests.rs
│       │       ├── game_tests.rs
│       │       └── epoch_tests.rs
│       └── Cargo.toml
├── PLAN.md
├── Agents.md
└── README.md
```

## Conclusion

This plan provides a roadmap for building Blendizzard on Soroban. The phased approach allows for iterative development while managing complexity. Key focus areas:

1. **Correctness:** Follow the spec, implement what's needed
2. **Security:** Multiple audit passes, invariant checking
3. **Efficiency:** Gas optimization for Soroban constraints
4. **Simplicity:** Don't add features not in the spec

The architecture leverages proven external contracts (fee-vault-v2, Soroswap) while implementing novel game-fi mechanics.

**Note:** This is a living document. As implementation progresses and unknowns become known, this plan should be updated.
