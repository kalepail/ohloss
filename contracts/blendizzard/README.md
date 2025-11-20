# Blendizzard Contract

Faction-based competitive gaming protocol on Stellar Soroban.

## Overview

This is the main Blendizzard smart contract implementing:
- Vault integration via fee-vault-v2 for yield generation
- Faction points system with asymptotic multipliers
- Game lifecycle management with whitelisted game contracts
- Epoch cycling with BLND→USDC conversion via Soroswap
- Proportional reward distribution to winning faction

## Building

```bash
stellar contract build
```

Output: `target/wasm32v1-none/release/blendizzard.wasm`

## Testing

```bash
cargo test
```

Current status: **61/61 tests passing**

## Documentation

See the root directory for comprehensive documentation:
- `README.md` - Project overview and quick start
- `CLAUDE.md` - Development guide and architecture
- `docs/PLAN.md` - Detailed technical specification
- `docs/SECURITY.md` - Security analysis
- `docs/PRODUCTION_READINESS.md` - Deployment checklist

## Contract Interface

27 exported functions across:
- Admin operations (initialize, upgrade, pause)
- Vault operations (deposit, withdraw)
- Faction management (select, lock)
- Game lifecycle (start, end)
- Epoch management (cycle, standings)
- Rewards (claim, query)

See root `README.md` for full function list and parameters.
