use super::testutils::{assert_contract_error, create_test_ohloss, setup_test_env, Error};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Address;

// ============================================================================
// Initialization Tests
// ============================================================================

#[test]
fn test_initialization() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Create contract (this calls __constructor)
    let client = create_test_ohloss(&env, &admin);

    // Verify admin is set
    let retrieved_admin = client.get_admin();
    assert_eq!(retrieved_admin, admin, "Admin address mismatch");
}

// ============================================================================
// Faction Selection Tests
// ============================================================================

#[test]
fn test_select_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    let client = create_test_ohloss(&env, &admin);

    // Select WholeNoodle faction (0)
    client.select_faction(&player, &0);

    // Verify faction
    let player_info = client.get_player(&player);
    assert_eq!(player_info.selected_faction, 0);
}

#[test]
fn test_change_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    let client = create_test_ohloss(&env, &admin);

    // Select WholeNoodle (0)
    client.select_faction(&player, &0);

    // Change to PointyStick (1)
    client.select_faction(&player, &1);

    let player_info = client.get_player(&player);
    assert_eq!(player_info.selected_faction, 1);
}

#[test]
fn test_invalid_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    let client = create_test_ohloss(&env, &admin);

    // Try invalid faction ID (valid values are 0, 1, 2)
    let result = client.try_select_faction(&player, &99);

    assert_contract_error(&result, Error::InvalidFaction);
}

// ============================================================================
// Game Registry Tests
// ============================================================================

#[test]
fn test_add_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);

    let client = create_test_ohloss(&env, &admin);

    // Initially not whitelisted
    assert!(!client.is_game(&game_contract));

    // Add game (with developer address)
    let developer = Address::generate(&env);
    client.add_game(&game_contract, &developer);

    // Now whitelisted
    assert!(client.is_game(&game_contract));
}

#[test]
fn test_remove_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);

    let client = create_test_ohloss(&env, &admin);

    // Add game (with developer address)
    let developer = Address::generate(&env);
    client.add_game(&game_contract, &developer);
    assert!(client.is_game(&game_contract));

    // Remove game
    client.remove_game(&game_contract);
    assert!(!client.is_game(&game_contract));
}

// ============================================================================
// Admin Tests
// ============================================================================

#[test]
fn test_change_admin() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let client = create_test_ohloss(&env, &admin);

    // Verify initial admin
    assert_eq!(client.get_admin(), admin);

    // Change admin
    client.set_admin(&new_admin);

    // Verify new admin
    assert_eq!(client.get_admin(), new_admin);
}

// ============================================================================
// Migration Tests (REMOVED)
// ============================================================================

// Player migration from V0 → V1 → V2 is complete.
// Migration tests and functions have been removed since all production
// data has been migrated to the current Player struct format.
