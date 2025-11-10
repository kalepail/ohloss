# Testing Patterns Reference

This document captures testing patterns learned from blend-together and other Soroban projects for integrating external contracts.

## WASM Imports Available

We have the following WASMs in `wasms/`:
- `fee_vault_v2.wasm` (38KB)
- `soroban_token_contract.wasm` (7.2KB)
- `soroswap_factory.wasm` (11KB)
- `soroswap_library.wasm` (20KB)
- `soroswap_pair.wasm` (26KB)
- `soroswap_router.wasm` (32KB)

## Key Patterns

### 1. WASM Import Pattern

```rust
// In test utility file (e.g., src/test/soroswap.rs)
mod token {
    soroban_sdk::contractimport!(file = "./wasms/soroban_token_contract.wasm");
    pub type TokenClient<'a> = Client<'a>;
}
use token::TokenClient;

mod router {
    soroban_sdk::contractimport!(file = "./wasms/soroswap_router.wasm");
    pub type SoroswapRouterClient<'a> = Client<'a>;
}
use router::SoroswapRouterClient;

// For WASM hash extraction (when deploying via factory):
fn pair_contract_wasm(e: &Env) -> BytesN<32> {
    soroban_sdk::contractimport!(file = "./wasms/soroswap_pair.wasm");
    e.deployer().upload_contract_wasm(WASM)
}
```

**Key Points:**
- Path is relative to Cargo.toml: `./wasms/filename.wasm`
- Each contract gets its own module
- Re-export Client as custom type for clarity
- Use WASM constant from import for factory deployments

### 2. Helper Function Pattern

```rust
pub fn create_<contract><'a>(
    e: &Env,
    // ... parameters
) -> ContractClient<'a> {
    // 1. Register/deploy contract
    let address = e.register(contract::WASM, ());

    // 2. Create client
    let client = ContractClient::new(e, &address);

    // 3. Initialize if needed
    client.initialize(/* ... */);

    // 4. Return configured client
    client
}
```

### 3. Test Setup Pattern

```rust
pub struct TestSetup<'a> {
    pub env: Env,
    pub admin: Address,
    pub usdc: Address,
    pub blnd: Address,
    pub fee_vault: FeeVaultClient<'a>,
    pub router: SoroswapRouterClient<'a>,
    pub contract: BlendizzardClient<'a>,
    // ... all clients needed by tests
}

pub fn setup_full<'a>() -> TestSetup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.set_default_info();

    // 1. Setup Soroswap
    // 2. Setup Fee Vault
    // 3. Setup our contract
    // 4. Wire them together

    TestSetup {
        env,
        admin,
        // ... everything tests need
    }
}
```

### 4. Mock Contract Pattern

When you need to mock external dependencies:

```rust
#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn get_reserve(e: Env, reserve: Address) -> Reserve {
        // Minimal implementation for tests
        Reserve {
            b_rate: 1_100_000_000_000,
            // ... other fields
        }
    }
}

pub fn create_mock_pool<'a>(e: &Env) -> MockPoolClient<'a> {
    let address = e.register(MockPool {}, ());
    MockPoolClient::new(e, &address)
}
```

### 5. Integration Test Pattern

```rust
#[test]
fn test_fee_vault_integration() {
    let setup = setup_full();

    // 1. Arrange
    let user = Address::generate(&setup.env);
    setup.usdc_client.mint(&user, &1000_0000000);

    // 2. Act
    setup.contract.deposit(&user, &100_0000000);
    setup.env.jump_time(86400); // Jump 1 day
    let yield_amount = setup.contract.claim_yield(&user, &epoch);

    // 3. Assert
    assert!(yield_amount > 0);
}
```

### 6. Env Extension Trait Pattern

```rust
pub trait EnvTestUtils {
    fn jump(&self, ledgers: u32);
    fn jump_time(&self, seconds: u64);
    fn set_default_info(&self);
}

impl EnvTestUtils for Env {
    fn jump(&self, ledgers: u32) {
        self.ledger().set(LedgerInfo {
            timestamp: self.ledger().timestamp() + (ledgers as u64 * 5),
            sequence_number: self.ledger().sequence() + ledgers,
            // ... other fields
        });
    }

    fn jump_time(&self, seconds: u64) {
        self.ledger().with_mut(|li| {
            li.timestamp = li.timestamp.saturating_add(seconds);
        });
    }
}
```

## File Structure

### Recommended Structure

```
src/
├── lib.rs
├── testutils.rs              # Basic test utilities
└── tests/
    ├── mod.rs
    ├── smoke.rs              # Basic smoke tests
    ├── setup.rs              # Main test fixture
    ├── fee_vault_utils.rs    # Fee vault WASM imports & helpers
    ├── soroswap_utils.rs     # Soroswap WASM imports & helpers
    └── integration.rs        # Integration tests
```

### Module Organization

**In lib.rs:**
```rust
#[cfg(test)]
mod testutils;

#[cfg(test)]
mod tests;
```

**In tests/mod.rs:**
```rust
mod smoke;
mod setup;
mod fee_vault_utils;
mod soroswap_utils;
mod integration;
```

## When to Use Each Pattern

### Use WASM Import When:
- You have WASM files but not the source crate
- You're testing deployed contract behavior
- You want to test exact production WASMs

### Use Direct Registration When:
- Contract is a dev-dependency
- You want to test against latest source
- You need to modify contract for testing

### Use Mocks When:
- External contract is complex
- You only need specific behaviors
- You want fast, isolated tests

## Common Operations

### Soroswap: Add Liquidity
```rust
pub fn add_liquidity(
    router: &SoroswapRouterClient,
    token_a: &Address,
    token_b: &Address,
    amount_a: i128,
    amount_b: i128,
    user: &Address,
) -> (i128, i128, i128) {
    router.add_liquidity(
        token_a,
        token_b,
        &amount_a,
        &amount_b,
        &0, // min_a
        &0, // min_b
        user,
        &(env.ledger().timestamp() + 1000), // deadline
    )
}
```

### Soroswap: Swap Tokens
```rust
pub fn swap_exact_tokens(
    router: &SoroswapRouterClient,
    path: &Vec<Address>,
    amount_in: i128,
    user: &Address,
) -> Vec<i128> {
    router.swap_exact_tokens_for_tokens(
        &amount_in,
        &0, // min_out
        path,
        user,
        &(env.ledger().timestamp() + 1000), // deadline
    )
}
```

### Fee Vault: Deposit
```rust
let shares = fee_vault.deposit(&user, &amount);
```

### Fee Vault: Admin Withdraw (for converting to USDC)
```rust
// As admin contract
let withdrawn = fee_vault.admin_withdraw(&amount);
```

## Testing TODOs

When implementing fee-vault and soroswap integration:

1. ✅ Create WASM import modules
2. ✅ Create helper functions for contract creation
3. ✅ Create comprehensive test setup
4. ✅ Test basic soroswap liquidity operations
5. ✅ Create mock pool for fee-vault testing
6. ⏳ Test deposit flow with fee-vault (requires full integration)
7. ⏳ Test BLND → USDC conversion with Soroswap
8. ⏳ Test epoch cycling with yield distribution
9. ⏳ Test reward claiming after yield conversion
10. ⏳ Test edge cases (no liquidity, failed swaps, etc.)

## Key Learnings from Implementation

### Token Minting is Critical
Always mint tokens to users before they attempt to add liquidity or make swaps:
```rust
setup.token_0.mint(&user, &10_000_000_0000000);
setup.token_1.mint(&user, &10_000_000_0000000);
```

### Budget Management
Reset the budget before complex operations:
```rust
env.cost_estimate().budget().reset_unlimited();
```

### Mock Pools for Testing
For isolated fee-vault testing, create a minimal mock pool:
```rust
#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn get_reserve(_env: Env, _reserve: Address) -> Reserve {
        Reserve {
            b_rate: 1_100_000_000_000,
            // ... other fields
        }
    }
}
```

### Authorization in Tests
- Use `env.mock_all_auths()` for simple tests
- Complex contract interactions (like fee-vault with real pool) require proper authorization chains
- Test utilities work best when isolated from full contract initialization

### Test Scope
- Utility tests: Test helpers and calculations in isolation
- Smoke tests: Test basic contract operations without external dependencies
- Integration tests: Test full workflows with all external contracts wired together

## Resources

- **blend-together**: `/Users/kalepail/Desktop/blend-together/contracts/hello_world/src/test/`
- **fee-vault-v2**: `/Users/kalepail/Desktop/Web/Soroban/fee-vault-v2/src/tests/`
- **soroswap**: `/Users/kalepail/Desktop/Web/Soroban/soroswap/core/contracts/*/src/test/`
- **Stellar Docs**: https://developers.stellar.org/docs/build/smart-contracts/
