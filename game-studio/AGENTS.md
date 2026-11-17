# AGENTS.md

Guidance for AI coding agents working in the OHLOSS Game Studio.

## Project Overview

OHLOSS Game Studio is a starter kit for building Soroban on-chain games that integrate with OHLOSS. It provides a mock OHLOSS contract, two example games (Twenty-One and Number Guess), a React frontend, and automated deployment scripts for Stellar testnet.

**Tech Stack:**
- **Contracts**: Rust with Soroban SDK 23.1.0, compiled to wasm32v1-none
- **Build Tool**: Stellar CLI (v21.0+)
- **Scripts**: TypeScript executed with Bun (NOT Node.js)
- **Frontend**: React 18 + TypeScript + Vite

## Quick Principles

- Follow the existing game patterns in `contracts/number-guess` and `contracts/twenty-one`.
- All games must call `start_game` and `end_game` on the OHLOSS contract.
- Keep randomness deterministic between simulation and submission (do not use ledger time/sequence).
- Prefer temporary storage with a 30-day TTL for game state.

## Essential Commands

### Development Workflow

```bash
# One-command setup (builds, deploys, configures, starts server)
bun run setup

# Individual steps
bun run build      # Build contracts
bun run deploy     # Deploy to testnet
bun run bindings   # Generate TypeScript bindings

# Frontend development
cd frontend
bun install        # Install dependencies
bun run dev        # Start dev server (localhost:3000)
bun run build      # Production build
```

### Contract Testing

```bash
# Run tests for a specific contract
cd contracts/number-guess
cargo test

# Run with output
cargo test -- --nocapture

# Build a single contract
stellar contract build --manifest-path contracts/number-guess/Cargo.toml
```

### Manual Deployment Operations

```bash
# Create/fund testnet identity
stellar keys generate testnet --network testnet
stellar keys fund testnet --network testnet

# Deploy a contract
stellar contract deploy \
  --wasm target/wasm32v1-none/release/[contract].wasm \
  --source testnet \
  --network testnet

# Invoke contract method
stellar contract invoke \
  --id [CONTRACT_ID] \
  --source testnet \
  --network testnet \
  -- method_name --arg1 value1
```

## Architecture

### Workspace Structure

This is a Cargo workspace with three contract members:
- `contracts/mock-ohloss/` - Minimal OHLOSS interface for development
- `contracts/twenty-one/` - Example game contract (Blackjack-style)
- `contracts/number-guess/` - Example game contract (Guessing game)

Shared dependencies are defined in the workspace root `Cargo.toml`.

### Critical OHLOSS Integration Pattern

**ALL game contracts MUST follow this integration pattern:**

```rust
// 1. Call start_game at the beginning of your game
fn call_ohloss_start_game(
    env: &Env,
    ohloss: &Address,
    game_id: &Address,
    session_id: u32,
    player1: &Address,
    player2: &Address,
    player1_wager: i128,
    player2_wager: i128,
) {
    env.invoke_contract(
        ohloss,
        &Symbol::new(env, "start_game"),
        (game_id, session_id, player1, player2, player1_wager, player2_wager).into_val(env),
    )
}

// 2. Call end_game when determining the winner
fn call_ohloss_end_game(
    env: &Env,
    ohloss: &Address,
    session_id: u32,
    player1_won: bool,  // true if player1 won, false if player2 won
) {
    env.invoke_contract(
        ohloss,
        &Symbol::new(env, "end_game"),
        (session_id, player1_won).into_val(env),
    )
}
```

**DO NOT modify this integration interface.** The mock contract during development and the production OHLOSS contract use the same interface.

### Deterministic Randomness Requirement

**CRITICAL**: Never use `env.ledger().timestamp()` or `env.ledger().sequence()` for randomness. These values differ between simulation and actual submission, causing transactions to fail.

**Correct pattern (see `contracts/number-guess/src/lib.rs`):**

```rust
fn generate_winning_number(
    env: &Env,
    session_id: u32,
    player1: &Address,
    player2: &Address,
    guess1: u32,
    guess2: u32,
) -> u32 {
    // Build seed from deterministic inputs only
    let mut seed_bytes = Bytes::new(env);
    seed_bytes.append(&Bytes::from_array(env, &session_id.to_be_bytes()));

    let p1_str = player1.to_string();
    seed_bytes.append(&p1_str.to_bytes());

    let p2_str = player2.to_string();
    seed_bytes.append(&p2_str.to_bytes());

    seed_bytes.append(&Bytes::from_array(env, &guess1.to_be_bytes()));
    seed_bytes.append(&Bytes::from_array(env, &guess2.to_be_bytes()));

    // Hash the seed
    let hash = env.crypto().sha256(&seed_bytes);

    // Convert to random number
    let hash_val = hash.to_array();
    let random_u32 = u32::from_be_bytes([
        hash_val[0], hash_val[1], hash_val[2], hash_val[3]
    ]);

    (random_u32 % 10) + 1  // Map to desired range
}
```

Use only: session IDs, player addresses, user inputs (guesses/moves), and contract state.

### Storage Strategy

Game contracts use **temporary storage with TTL** for active game sessions:

```rust
const ONE_DAY_IN_LEDGERS: u32 = 17280;  // ~5 seconds per ledger
const GAME_TTL: u32 = ONE_DAY_IN_LEDGERS * 30;  // 30 days

// Store game state
env.storage().temporary().set(&game_key, &game);
env.storage().temporary().extend_ttl(&game_key, GAME_TTL, GAME_TTL);
```

Use **instance storage** for configuration (admin, ohloss address).

### Contract Standard Structure

All game contracts should include:
1. `__constructor(env: Env, admin: Address, ohloss: Address)` - Initialization
2. `start_game(...)` - Start game session (calls OHLOSS)
3. Game-specific methods (make_guess, make_move, etc.)
4. Winner determination logic (calls OHLOSS end_game)
5. `get_admin()`, `set_admin()`, `get_ohloss()`, `set_ohloss()`
6. `upgrade(env: Env, new_wasm_hash: BytesN<32>)` - Contract upgrades

### Deployment Configuration Flow

1. `scripts/build.ts` → Compiles contracts to `target/wasm32v1-none/release/`
2. `scripts/deploy.ts` → Deploys contracts, saves `deployment.json`
3. `scripts/bindings.ts` → Generates TypeScript bindings to `bindings/`
4. `scripts/setup.ts` → Orchestrates above + writes `.env` to repo root
5. Frontend reads config from `src/config.ts` (which uses Vite env vars from root `.env`)

**deployment.json structure:**
```json
{
  "mockOhlossId": "C...",
  "numberGuessId": "C...",
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "deployedAt": "2025-12-16T..."
}
```

### Frontend Component Architecture

Game components are **self-contained drop-in modules** designed for easy integration:

```typescript
interface GameProps {
  rpcUrl: string
  networkPassphrase: string
  mockOhlossId: string
  gameContractId: string  // Your game's contract ID
}
```

Each game lives in `frontend/src/games/[game-name]/` with its own `.tsx` and `.css` files.

## Building a New Game

### Contract Checklist (Soroban)

1. Copy a template: `cp -r contracts/number-guess contracts/<game-name>`
2. Update the package name in `contracts/<game-name>/Cargo.toml`.
3. Add it to the workspace `members` in root `Cargo.toml` (alongside `contracts/mock-ohloss`, `contracts/twenty-one`, `contracts/number-guess`).
4. Implement the OHLOSS client interface (do NOT modify the `call_ohloss_start_game` / `call_ohloss_end_game` integration above):
   ```rust
   #[contractclient(name = "OhlossClient")]
   pub trait Ohloss {
       fn start_game(
           env: Env,
           game_id: Address,
           session_id: u32,
           player1: Address,
           player2: Address,
           player1_wager: i128,
           player2_wager: i128,
       );

       fn end_game(env: Env, session_id: u32, player1_won: bool);
   }
   ```
5. Require player auth on `start_game` using `require_auth_for_args` for wagers; call `player.require_auth()` for every player action.
6. Create/track game state in temporary storage and extend TTL.
7. Call `ohloss.start_game(...)` in `start_game` and `ohloss.end_game(...)` in your game-end path.
8. Use deterministic randomness (pattern in `contracts/number-guess`).
9. Update deployment scripts: `scripts/deploy.ts` (deployment logic), `scripts/bindings.ts` (bindings generation), `scripts/setup.ts` (env var).
10. Add tests in `contracts/<game-name>/src/test.rs` (use the mock Ohloss pattern), including full game flows that verify OHLOSS integration; then `cd contracts/<game-name> && cargo test` and `bun run setup`.

### Constraints

- Never skip player auth.
- Validate inputs: check ranges, uniqueness, and game state before processing.
- Handle errors explicitly with an `Error` enum (see the example games).

### Frontend Checklist

1. Create `frontend/src/games/<game-name>/` with `<GameName>Game.tsx` (UI and state), `<gameName>Service.ts` (contract calls) and `bindings.ts` (generated bindings), plus a `.css` file.
2. Use the existing service pattern from `number-guess` for multi-sig game creation.
3. Update `frontend/src/utils/constants.ts`: `export const <GAME_NAME>_CONTRACT = getContractId('<game-name>');`
4. Update `frontend/src/config.ts` with a backwards-compatible alias if needed.
5. Add routing and a card entry in `frontend/src/components/GamesCatalog.tsx`.

### Bindings Generation

```bash
stellar contract build --manifest-path contracts/<game-name>/Cargo.toml
stellar contract bindings typescript \
  --wasm target/wasm32v1-none/release/<game_name>.wasm \
  --output-dir bindings/<game_name> \
  --overwrite
```

Copy the generated `bindings/<game_name>/src/index.ts` into `frontend/src/games/<game-name>/bindings.ts`.

### Game UX Guidelines

- Provide clear create/import/load flows (see `NumberGuessGame.tsx`).
- Include a lightweight animation or visual feedback for key actions.
- Show wagers, player addresses (shortened), and win/lose state.

### Final QA Checklist

- Contract builds successfully.
- `start_game` + `end_game` are called.
- Frontend connects to the correct contract ID.
- Game card appears in the catalog.
- Both players can complete a full game flow.

## Common Issues

### "stellar: command not found"
Install Stellar CLI: `cargo install --locked stellar-cli --features opt`

### "wasm32v1-none target not found"
Add target: `rustup target add wasm32v1-none`

### "Contract IDs not configured" in frontend
Run `bun run setup` to deploy and configure contracts

### Deterministic randomness violations
If transaction succeeds in simulation but fails in submission, you're likely using `env.ledger().timestamp()` or `.sequence()`. Replace with deterministic inputs.

### Profile warnings during build
Harmless warnings from workspace setup. Individual contract Cargo.toml `[profile]` sections are ignored.

## References

- Full documentation: README.md
- Developer guide: CONTRIBUTING.md
- Quick start: QUICKSTART.md
- Implementation details: IMPLEMENTATION_SUMMARY.md
- Example contract: `contracts/number-guess/src/lib.rs`
- Example tests: `contracts/number-guess/src/test.rs`
- Soroban docs: https://developers.stellar.org/docs/soroban

