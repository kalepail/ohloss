#![allow(dead_code)]

/// Soroswap Test Utilities
///
/// This module provides helpers for testing Soroswap DEX integration.
/// Based on patterns from blend-together and soroswap/core projects.
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

// ============================================================================
// WASM Imports
// ============================================================================

// Token Contract
mod token {
    soroban_sdk::contractimport!(file = "./wasms/soroban_token_contract.wasm");
    pub type TokenClient<'a> = Client<'a>;
}
pub use token::TokenClient;

// Factory Contract
mod factory {
    soroban_sdk::contractimport!(file = "./wasms/soroswap_factory.wasm");
    pub type SoroswapFactoryClient<'a> = Client<'a>;
}
pub use factory::SoroswapFactoryClient;

// Router Contract
mod router {
    soroban_sdk::contractimport!(file = "./wasms/soroswap_router.wasm");
    pub type SoroswapRouterClient<'a> = Client<'a>;
}
pub use router::SoroswapRouterClient;

// Pair Contract (for WASM hash)
fn pair_contract_wasm(e: &Env) -> BytesN<32> {
    soroban_sdk::contractimport!(file = "./wasms/soroswap_pair.wasm");
    e.deployer().upload_contract_wasm(WASM)
}

// ============================================================================
// Helper Functions - Contract Creation
// ============================================================================

/// Create a token contract for testing
pub fn create_token<'a>(env: &Env, admin: &Address) -> TokenClient<'a> {
    TokenClient::new(
        env,
        &env.register_stellar_asset_contract_v2(admin.clone())
            .address(),
    )
}

/// Create and initialize Soroswap factory
pub fn create_factory<'a>(env: &Env, setter: &Address) -> SoroswapFactoryClient<'a> {
    let pair_hash = pair_contract_wasm(env);
    let factory_address = env.register(factory::WASM, ());
    let factory = SoroswapFactoryClient::new(env, &factory_address);
    factory.initialize(setter, &pair_hash);
    factory
}

/// Create Soroswap router (factory must exist first)
pub fn create_router<'a>(env: &Env) -> SoroswapRouterClient<'a> {
    let router_address = env.register(router::WASM, ());
    SoroswapRouterClient::new(env, &router_address)
}

// ============================================================================
// Helper Functions - Common Operations
// ============================================================================

/// Add liquidity to a pair via router
///
/// # Arguments
/// * `router` - Router client
/// * `token_a` - First token address
/// * `token_b` - Second token address
/// * `amount_a` - Amount of token A to add
/// * `amount_b` - Amount of token B to add
/// * `player` - Player providing liquidity
///
/// # Returns
/// (amount_a, amount_b, liquidity) - Actual amounts added and LP tokens minted
pub fn add_liquidity<'a>(
    env: &Env,
    router: &SoroswapRouterClient<'a>,
    token_a: &Address,
    token_b: &Address,
    amount_a: i128,
    amount_b: i128,
    player: &Address,
) -> (i128, i128, i128) {
    let deadline = env.ledger().timestamp() + 1000;

    router.add_liquidity(
        token_a, token_b, &amount_a, &amount_b,
        &0, // amount_a_min (accept any slippage for tests)
        &0, // amount_b_min
        player, &deadline,
    )
}

/// Swap exact input tokens for output tokens
///
/// # Arguments
/// * `router` - Router client
/// * `amount_in` - Amount of input tokens
/// * `amount_out_min` - Minimum output tokens (use 0 for tests)
/// * `path` - Token swap path [token_in, token_out, ...]
/// * `to` - Recipient address
///
/// # Returns
/// Vec of amounts for each step in the path
pub fn swap_exact_tokens_for_tokens<'a>(
    env: &Env,
    router: &SoroswapRouterClient<'a>,
    amount_in: i128,
    amount_out_min: i128,
    path: &Vec<Address>,
    to: &Address,
) -> Vec<i128> {
    let deadline = env.ledger().timestamp() + 1000;

    router.swap_exact_tokens_for_tokens(&amount_in, &amount_out_min, path, to, &deadline)
}

/// Swap tokens for exact output tokens
///
/// # Arguments
/// * `router` - Router client
/// * `amount_out` - Desired output amount
/// * `amount_in_max` - Maximum input tokens willing to spend
/// * `path` - Token swap path
/// * `to` - Recipient address
///
/// # Returns
/// Vec of amounts for each step
pub fn swap_tokens_for_exact_tokens<'a>(
    env: &Env,
    router: &SoroswapRouterClient<'a>,
    amount_out: i128,
    amount_in_max: i128,
    path: &Vec<Address>,
    to: &Address,
) -> Vec<i128> {
    let deadline = env.ledger().timestamp() + 1000;

    router.swap_tokens_for_exact_tokens(&amount_out, &amount_in_max, path, to, &deadline)
}

// ============================================================================
// Test Setup
// ============================================================================

/// Complete Soroswap test setup
///
/// Creates factory, router, two tokens, and adds initial liquidity
pub struct SoroswapTestSetup<'a> {
    pub env: Env,
    pub admin: Address,
    pub factory: SoroswapFactoryClient<'a>,
    pub router: SoroswapRouterClient<'a>,
    pub token_0: TokenClient<'a>,
    pub token_1: TokenClient<'a>,
}

impl<'a> SoroswapTestSetup<'a> {
    /// Create a complete Soroswap test environment
    pub fn new() -> Self {
        use super::testutils::setup_test_env;
        let env = setup_test_env();

        let admin = Address::generate(&env);

        // Create tokens (ensure token_0 < token_1 for Soroswap)
        let mut token_0 = create_token(&env, &admin);
        let mut token_1 = create_token(&env, &admin);

        if token_1.address < token_0.address {
            core::mem::swap(&mut token_0, &mut token_1);
        }

        // Create factory and router
        let factory = create_factory(&env, &admin);
        let router = create_router(&env);
        router.initialize(&factory.address);

        SoroswapTestSetup {
            env,
            admin,
            factory,
            router,
            token_0,
            token_1,
        }
    }

    /// Add liquidity with default amounts (useful for quick setup)
    pub fn add_default_liquidity(&self, player: &Address) -> (i128, i128, i128) {
        let amount_0 = 1_000_000_0000000; // 1M tokens
        let amount_1 = 1_000_000_0000000;

        add_liquidity(
            &self.env,
            &self.router,
            &self.token_0.address,
            &self.token_1.address,
            amount_0,
            amount_1,
            player,
        )
    }
}

// ============================================================================
// Price/Quote Calculations
// ============================================================================

/// Calculate output amount for a swap
///
/// Uses constant product formula: x * y = k
/// output = (amount_in * reserve_out) / (reserve_in + amount_in)
pub fn get_amount_out(amount_in: i128, reserve_in: i128, reserve_out: i128) -> i128 {
    if amount_in <= 0 || reserve_in <= 0 || reserve_out <= 0 {
        return 0;
    }

    // Apply 0.3% fee (multiply by 997/1000)
    let amount_in_with_fee = amount_in * 997;
    let numerator = amount_in_with_fee * reserve_out;
    let denominator = (reserve_in * 1000) + amount_in_with_fee;

    numerator / denominator
}

/// Calculate input amount needed for desired output
pub fn get_amount_in(amount_out: i128, reserve_in: i128, reserve_out: i128) -> i128 {
    if amount_out <= 0 || reserve_in <= 0 || reserve_out <= 0 {
        return 0;
    }

    let numerator = reserve_in * amount_out * 1000;
    let denominator = (reserve_out - amount_out) * 997;

    (numerator / denominator) + 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_soroswap_setup() {
        let setup = SoroswapTestSetup::new();

        // Verify basic setup
        assert!(setup.token_0.address < setup.token_1.address);
        assert_eq!(setup.router.get_factory(), setup.factory.address);
    }

    #[test]
    fn test_get_amount_out() {
        // With 1000 in, 1000 out reserves, swapping 100
        // output = (100 * 997 * 1000) / (1000 * 1000 + 100 * 997)
        let out = get_amount_out(100, 1000, 1000);
        assert!(out > 0 && out < 100); // Should be less due to fees
    }

    #[test]
    fn test_get_amount_in() {
        // Calculate how much input needed for 90 output
        let amount_in = get_amount_in(90, 1000, 1000);
        assert!(amount_in > 90); // Should be more due to fees

        // Verify it gives us the desired output
        let amount_out = get_amount_out(amount_in, 1000, 1000);
        assert!(amount_out >= 90);
    }

    #[test]
    fn test_add_liquidity() {
        let setup = SoroswapTestSetup::new();
        let player = Address::generate(&setup.env);

        // Mint tokens to player (following blend-together pattern)
        setup.token_0.mint(&player, &10_000_000_0000000);
        setup.token_1.mint(&player, &10_000_000_0000000);

        let (amount_a, amount_b, liquidity) = setup.add_default_liquidity(&player);

        assert!(amount_a > 0);
        assert!(amount_b > 0);
        assert!(liquidity > 0);
    }
}
