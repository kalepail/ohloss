# OHLOSS Game Studio

Starter kit for building web3 games on Stellar that integrate with OHLOSS.

## Quick Start

**Prerequisites:**
- [Bun](https://bun.sh/) v1.0+
- [Rust](https://www.rust-lang.org/) v1.84.0+ with `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools) v21.0+

```bash
# Install dependencies
curl -fsSL https://bun.sh/install | bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --locked stellar-cli --features opt
rustup target add wasm32v1-none

# Setup and run
bun run setup
```

Your dev server will start at http://localhost:3000

## Project Structure

```
├── contracts/               # Smart contracts for games and ohloss mock
├── frontend/src/games/      # Drop-in game UI components
├── scripts/                 # Build & deployment automation
└── bindings/                # Generated TypeScript bindings
```

## Development Commands

```bash
bun run setup      # Full setup (build + deploy + configure + start)
bun run build      # Build contracts only
bun run deploy     # Deploy to testnet only
bun run bindings   # Generate TypeScript bindings only

# Contract testing
cd contracts/number-guess && cargo test

# Start frontend
bun run dev
```

## Documentation

The frontend includes in-app documentation, but the core game-development steps are below so you can follow them without running the UI.

## Develop a New Game

### Overview
Adding a new game means:
- Create a Soroban contract.
- Add it to the Cargo workspace.
- Add a frontend game component and service.
- Register the game in the catalog.

The build/deploy/bindings/setup scripts auto-discover contracts from the workspace, so you do **not** need to edit scripts when adding a game.

### Step 1: Copy a Template Contract
```bash
cp -r contracts/number-guess contracts/my-game
```

### Step 2: Update the Contract Manifest
Edit `contracts/my-game/Cargo.toml`:
```toml
[package]
name = "my-game"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]
doctest = false

[dependencies]
soroban-sdk = { workspace = true }
```

### Step 3: Add the Contract to the Workspace
Edit the root `Cargo.toml`:
```toml
[workspace]
resolver = "2"
members = [
  "contracts/mock-ohloss",
  "contracts/twenty-one",
  "contracts/number-guess",
  "contracts/my-game", # Add this line
]
```

### Step 4: Implement Required OHLOSS Calls
Your game contract should call `start_game` and `end_game` on the OHLOSS contract.
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

    fn end_game(
        env: Env,
        session_id: u32,
        player1_won: bool
    );
}
```

### Step 5: Test Your Contract
```bash
cd contracts/my-game
cargo test
```

#### Native Rust Tests (Mock Ohloss)
Game contracts are expected to use a minimal in-memory Mock Ohloss for unit tests.
This keeps tests fast and deterministic while preserving the real integration interface.

Examples:
- `contracts/number-guess/src/test.rs`
- `contracts/twenty-one/src/test.rs`

Key pattern:
```rust
let env = Env::default();
env.mock_all_auths();

// Deploy mock Ohloss and game contract
let ohloss_addr = env.register(MockOhloss, ());
let admin = Address::generate(&env);
let game_id = env.register(MyGameContract, (&admin, &ohloss_addr));
let client = MyGameContractClient::new(&env, &game_id);

// Optional: whitelist game in mock
let ohloss = MockOhlossClient::new(&env, &ohloss_addr);
ohloss.add_game(&game_id);
```

Run:
```bash
cd contracts/my-game
cargo test
```

### Step 6: Build, Deploy, Generate Bindings (Automatic)
Once listed in the workspace, these scripts automatically build/deploy and generate bindings:
```bash
bun run setup
```

Example: a crate named `my-game` generates `bindings/my_game/` and writes
`VITE_MY_GAME_CONTRACT_ID` to the root `.env`.

### Step 7: Add Frontend Component + Service
Create a new game folder:
```
frontend/src/games/my-game/
```

Follow the service pattern to accept a `contractId` (instead of hard-coding it):
```ts
// myGameService.ts
import { Client as MyGameClient } from 'my-game';
import { NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';

export class MyGameService {
  private contractId: string;
  private baseClient: MyGameClient;

  constructor(contractId: string) {
    this.contractId = contractId;
    this.baseClient = new MyGameClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }
}
```

In your component, wire it up with the contract ID helper:
```ts
import { getContractId } from '@/utils/constants';
import { MyGameService } from './myGameService';

const myGameService = new MyGameService(getContractId('my-game'));
```

### Step 8: Register the Game in the Catalog
Update `frontend/src/components/GamesCatalog.tsx`:
1. Import your component.
2. Add a route condition in the render switch.
3. Add a game card in the grid.

Use the existing `number-guess` or `twenty-one` entries as templates.

### Best Practices
- Always call `player.require_auth()` for player actions.
- Validate all inputs before processing.
- Use temporary storage with proper TTL for game sessions.
- Keep contract logic simple and focused.
- Write comprehensive tests for all game flows.

## Import an Existing Game

### Step 1: Add Contract Files
```bash
cp -r /path/to/game-contract contracts/imported-game
```

### Step 2: Add to Cargo Workspace
```toml
[workspace]
members = [
  "contracts/mock-ohloss",
  "contracts/twenty-one",
  "contracts/number-guess",
  "contracts/imported-game", # Add this
]
```

### Step 3: Build, Deploy, Generate Bindings
```bash
bun run setup
```

Example: `imported-game` generates `bindings/imported_game/` and writes
`VITE_IMPORTED_GAME_CONTRACT_ID` to the root `.env`.

### Step 4: Add Frontend Component + Service
```bash
cp -r /path/to/game/frontend/src/games/imported-game frontend/src/games/
```

Make sure your service accepts a `contractId` (see the pattern above).

### Step 5: Register in the Catalog
Update `frontend/src/components/GamesCatalog.tsx` (import, routing, and card).

### Step 6: Deploy and Test
```bash
bun run setup
# or run steps individually:
bun run build
bun run deploy
bun run bindings
cd frontend && bun run dev
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `stellar: command not found` | `cargo install --locked stellar-cli --features opt` |
| `wasm32v1-none target not found` | `rustup target add wasm32v1-none` |
| `insufficient balance` | `stellar keys fund testnet --network testnet` |
| `Contract IDs not configured` | `bun run setup` |

## Resources

- [Soroban Docs](https://developers.stellar.org/docs/soroban)
- [Soroban SDK Reference](https://docs.rs/soroban-sdk/latest/soroban_sdk/)
- [Stellar CLI Guide](https://developers.stellar.org/docs/tools/developer-tools)
