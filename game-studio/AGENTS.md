# AGENTS.md

This repo is the OHLOSS Game Studio. Use this guide when creating new games.

## Quick Principles
- Follow the existing game patterns in `contracts/number-guess` and `contracts/twenty-one`.
- All games must call `start_game` and `end_game` on the OHLOSS contract.
- Keep randomness deterministic between simulation and submission (do not use ledger time/sequence).
- Prefer temporary storage with a 30-day TTL for game state.

## Contract Checklist (Soroban)
1. Copy an existing contract folder (e.g. `contracts/number-guess`) to `contracts/<game-name>`.
2. Update `contracts/<game-name>/Cargo.toml` with the new package name.
3. Implement the required OHLOSS client interface:
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
4. Require player auth on `start_game` using `require_auth_for_args` for wagers.
5. Create/track game state in temporary storage and extend TTL.
6. Call `ohloss.start_game(...)` in `start_game` and `ohloss.end_game(...)` in your game-end path.
7. Add tests in `contracts/<game-name>/src/test.rs` (use the mock Ohloss pattern).

## Workspace Wiring
- Add the contract to the workspace members list in root `Cargo.toml`:
  ```toml
  members = [
    "contracts/mock-ohloss",
    "contracts/twenty-one",
    "contracts/number-guess",
    "contracts/<game-name>",
  ]
  ```

## Frontend Checklist
1. Create a new folder: `frontend/src/games/<game-name>/`.
2. Add three files:
   - `<GameName>Game.tsx` (UI and state)
   - `<gameName>Service.ts` (contract calls)
   - `bindings.ts` (generated bindings)
3. Use the existing service pattern from `number-guess` for multi-sig game creation.
4. Update `frontend/src/utils/constants.ts`:
   ```ts
   export const <GAME_NAME>_CONTRACT = getContractId('<game-name>');
   ```
5. Update `frontend/src/config.ts` with a backwards-compatible alias if needed.
6. Add routing and a card entry in `frontend/src/components/GamesCatalog.tsx`.

## Bindings Generation
- Build the contract:
  ```bash
  stellar contract build --manifest-path contracts/<game-name>/Cargo.toml
  ```
- Generate TS bindings from the WASM:
  ```bash
  stellar contract bindings typescript \
    --wasm target/wasm32v1-none/release/<game_name>.wasm \
    --output-dir bindings/<game_name> \
    --overwrite
  ```
- Copy the generated `bindings/<game_name>/src/index.ts` into
  `frontend/src/games/<game-name>/bindings.ts`.

## Deployment / Local Testing
- Build all contracts:
  ```bash
  bun run build
  ```
- Deploy to testnet and generate bindings:
  ```bash
  bun run deploy
  bun run bindings
  ```
- Start the frontend:
  ```bash
  cd frontend && bun run dev
  ```

## Game UX Guidelines
- Provide clear create/import/load flows (see `NumberGuessGame.tsx`).
- Include a lightweight animation or visual feedback for key actions.
- Show wagers, player addresses (shortened), and win/lose state.

## Final QA Checklist
- Contract builds successfully.
- `start_game` + `end_game` are called.
- Frontend connects to the correct contract ID.
- Game card appears in the catalog.
- Both players can complete a full game flow.
