# Blendizzard Game Studio

Starter kit for building web3 games on Stellar that integrate with Blendizzard.

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
├── contracts/               # Smart contracts for games and Blendizzard mock
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

The frontend includes documentation and instructions for building out your games.

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
