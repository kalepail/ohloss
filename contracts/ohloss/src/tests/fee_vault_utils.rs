#![allow(dead_code)]

/// Fee Vault V2 Test Utilities
///
/// This module provides helpers for testing fee-vault integration.
/// Based on patterns from blend-together project.
use fee_vault_v2::FeeVault;
use soroban_sdk::{contract, contractimpl, Address, Env};

// ============================================================================
// WASM Imports
// ============================================================================

mod fee_vault {
    soroban_sdk::contractimport!(file = "./wasms/fee_vault_v2.wasm");
    pub type FeeVaultClient<'a> = Client<'a>;
}
pub use fee_vault::FeeVaultClient;

// ============================================================================
// Helper Functions
// ============================================================================

/// Create and initialize a fee vault contract using env.register pattern
///
/// # Arguments
/// * `env` - Test environment (must have mock_all_auths() called before)
/// * `admin` - Admin address for the vault
/// * `pool` - Blend pool address
/// * `asset` - Asset address (USDC)
/// * `rate_type` - Fee rate type (0 = fixed, 1 = dynamic)
/// * `rate` - Fee rate (basis points with 5 decimals, e.g., 100_00000 = 1%)
/// * `signer` - Optional signer address
///
/// # Returns
/// Initialized FeeVaultClient
///
/// # Note
/// This uses the register pattern which works well with mock_all_auths().
/// Ensure env.mock_all_auths() is called before using this function.
pub fn create_fee_vault<'a>(
    env: &Env,
    admin: &Address,
    pool: &Address,
    asset: &Address,
    rate_type: u32,
    rate: u32,
    signer: Option<Address>,
) -> FeeVaultClient<'a> {
    // Register the contract - requires mock_all_auths() to be called first
    let address = env.register(
        FeeVault {},
        (
            admin.clone(),
            pool.clone(),
            asset.clone(),
            rate_type,
            rate,
            signer,
        ),
    );

    FeeVaultClient::new(env, &address)
}

/// Create a simple fee vault for testing with default parameters
///
/// Uses fixed rate of 1% (100_00000 basis points)
pub fn create_test_fee_vault<'a>(
    env: &Env,
    admin: &Address,
    pool: &Address,
    asset: &Address,
) -> FeeVaultClient<'a> {
    create_fee_vault(env, admin, pool, asset, 0, 100_00000, None)
}

// ============================================================================
// Mock Vault (for smoke tests that don't need real vault)
// ============================================================================

use soroban_sdk::contracttype;

/// Storage key for mock vault state
#[contracttype]
pub enum MockVaultDataKey {
    /// Admin BLND balance available for withdrawal
    AdminBalance,
    /// Emissions available for claiming per reserve token ID
    Emissions(u32),
    /// Player underlying token balance (for cross-epoch architecture)
    UserBalance(Address),
}

#[contract]
pub struct MockVault;

#[contractimpl]
impl MockVault {
    /// Mock deposit - just returns the amount as "shares"
    pub fn deposit(_env: Env, _user: Address, amount: i128) -> i128 {
        amount // Return amount as shares (1:1)
    }

    /// Mock withdraw - just returns the amount as underlying
    pub fn withdraw(_env: Env, _user: Address, amount: i128) -> i128 {
        amount // Return amount as underlying (1:1)
    }

    /// Mock get_shares
    pub fn get_shares(_env: Env, _user: Address) -> i128 {
        0
    }

    /// Mock get_underlying_tokens - returns stored player balance
    /// This is the key method for cross-epoch balance tracking
    pub fn get_underlying_tokens(env: Env, player: Address) -> i128 {
        let key = MockVaultDataKey::UserBalance(player);
        env.storage()
            .instance()
            .get::<MockVaultDataKey, i128>(&key)
            .unwrap_or(0)
    }

    /// Mock admin_withdraw - withdraws from stored admin balance
    /// Returns the requested amount and decrements the balance
    pub fn admin_withdraw(env: Env, amount: i128) -> i128 {
        let key = MockVaultDataKey::AdminBalance;
        let current_balance = env
            .storage()
            .instance()
            .get::<MockVaultDataKey, i128>(&key)
            .unwrap_or(0);

        // Return min of requested amount and available balance
        let withdraw_amount = amount.min(current_balance);

        // Update balance
        env.storage()
            .instance()
            .set(&key, &(current_balance - withdraw_amount));

        withdraw_amount
    }

    /// Mock get_underlying_admin_balance - returns stored admin balance
    pub fn get_underlying_admin_balance(env: Env) -> i128 {
        env.storage()
            .instance()
            .get::<MockVaultDataKey, i128>(&MockVaultDataKey::AdminBalance)
            .unwrap_or(0)
    }

    /// Mock claim_emissions - claims from stored emissions per reserve token ID
    /// Transfers BLND to the `to` address and returns total claimed
    ///
    /// # Arguments
    /// * `reserve_token_ids` - Vec of reserve token IDs to claim from
    /// * `to` - Address to receive the claimed BLND
    ///
    /// # Returns
    /// Total BLND claimed across all reserve token IDs
    pub fn claim_emissions(
        env: Env,
        reserve_token_ids: soroban_sdk::Vec<u32>,
        _to: Address,
    ) -> i128 {
        let mut total_claimed = 0i128;

        // Sum emissions from all specified reserve token IDs
        for reserve_id in reserve_token_ids.iter() {
            let key = MockVaultDataKey::Emissions(reserve_id);
            let emissions = env
                .storage()
                .instance()
                .get::<MockVaultDataKey, i128>(&key)
                .unwrap_or(0);

            total_claimed += emissions;

            // Reset emissions for this reserve to 0 after claiming
            env.storage().instance().set(&key, &0i128);
        }

        total_claimed
    }

    // ============================================================================
    // Test Helper Functions (for setting up mock state)
    // ============================================================================

    /// Set admin BLND balance for testing
    /// This is a test-only function to configure the mock vault
    pub fn set_admin_balance(env: Env, amount: i128) {
        env.storage()
            .instance()
            .set(&MockVaultDataKey::AdminBalance, &amount);
    }

    /// Set emissions for a specific reserve token ID
    /// This is a test-only function to configure the mock vault
    pub fn set_emissions(env: Env, reserve_token_id: u32, amount: i128) {
        env.storage()
            .instance()
            .set(&MockVaultDataKey::Emissions(reserve_token_id), &amount);
    }

    /// Set player balance for testing (cross-epoch architecture)
    /// This is a test-only function to configure player balances in the mock vault
    pub fn set_user_balance(env: Env, player: Address, amount: i128) {
        env.storage()
            .instance()
            .set(&MockVaultDataKey::UserBalance(player), &amount);
    }
}

/// Create a mock vault for smoke tests (no constructor auth issues)
pub fn create_mock_vault(env: &Env) -> Address {
    env.register(MockVault, ())
}

/// Create a mock vault client for configuring and using the mock vault
pub fn create_mock_vault_client<'a>(env: &'a Env) -> MockVaultClient<'a> {
    let address = create_mock_vault(env);
    MockVaultClient::new(env, &address)
}

// ============================================================================
// Mock Pool (for real vault)
// ============================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reserve {
    pub b_rate: i128,
    pub b_supply: i128,
    pub c_factor: u32,
    pub d_rate: i128,
    pub index: u32,
    pub ir_mod: i128,
    pub l_factor: u32,
    pub last_time: u64,
    pub scalar: i128,
}

#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    /// Mock get_reserve function for fee-vault-v2
    pub fn get_reserve(_env: Env, _reserve: Address) -> Reserve {
        // Return a mock reserve with reasonable values
        Reserve {
            b_rate: 1_100_000_000_000, // 1.1 exchange rate
            b_supply: 0,
            c_factor: 900_0000,
            d_rate: 1_000_000_000_000,
            index: 0,
            ir_mod: 0,
            l_factor: 900_0000,
            last_time: 0,
            scalar: 10_000_000, // 7 decimals
        }
    }
}

/// Create a mock Blend pool for testing
pub fn create_mock_pool(env: &Env) -> Address {
    env.register(MockPool, ())
}

// ============================================================================
// Fee Vault Operations
// ============================================================================

/// Deposit assets into fee vault
pub fn deposit_to_vault(vault: &FeeVaultClient, player: &Address, amount: i128) -> i128 {
    vault.deposit(player, &amount)
}

/// Get shares for a player
pub fn get_vault_shares(vault: &FeeVaultClient, player: &Address) -> i128 {
    vault.get_shares(player)
}

/// Admin withdraw from vault (for yield distribution)
pub fn admin_withdraw_from_vault(vault: &FeeVaultClient, amount: i128) -> i128 {
    vault.admin_withdraw(&amount)
}

// ============================================================================
// Test Utilities
// ============================================================================

/// Calculate expected shares for a deposit
///
/// Formula: shares = amount * total_shares / total_b_tokens
/// If first deposit: shares = amount
pub fn calculate_expected_shares(amount: i128, total_shares: i128, total_b_tokens: i128) -> i128 {
    if total_shares == 0 || total_b_tokens == 0 {
        amount
    } else {
        (amount * total_shares) / total_b_tokens
    }
}

#[cfg(test)]
mod tests {
    use super::super::testutils::setup_test_env;
    use super::*;

    #[test]
    fn test_mock_pool_creation() {
        let env = setup_test_env();

        // Test that we can create a mock pool
        let pool = create_mock_pool(&env);

        // Verify pool was created
        assert!(pool.to_string().len() > 0);

        // Note: Full fee vault creation test requires more complex setup
        // with proper authorization chain. This will be covered in
        // integration tests when we wire everything together.
    }

    #[test]
    fn test_calculate_expected_shares() {
        // First deposit
        assert_eq!(calculate_expected_shares(1000, 0, 0), 1000);

        // Subsequent deposits
        assert_eq!(calculate_expected_shares(1000, 5000, 5000), 1000);
        assert_eq!(calculate_expected_shares(500, 1000, 2000), 250);
    }
}
