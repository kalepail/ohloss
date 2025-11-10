use super::testutils::{create_test_blendizzard, setup_test_env};
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
    let client = create_test_blendizzard(&env, &admin);

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
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Select WholeNoodle faction (0)
    client.select_faction(&user, &0);

    // Verify faction
    let player_info = client.get_player(&user);
    assert_eq!(player_info.selected_faction, 0);
}

#[test]
fn test_change_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Select WholeNoodle (0)
    client.select_faction(&user, &0);

    // Change to PointyStick (1)
    client.select_faction(&user, &1);

    let player_info = client.get_player(&user);
    assert_eq!(player_info.selected_faction, 1);
}

#[test]
#[should_panic]
fn test_invalid_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Try invalid faction ID - should panic
    client.select_faction(&user, &99);
}

// ============================================================================
// Game Registry Tests
// ============================================================================

#[test]
fn test_add_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Initially not whitelisted
    assert!(!client.is_game(&game_contract));

    // Add game
    client.add_game(&game_contract);

    // Now whitelisted
    assert!(client.is_game(&game_contract));
}

#[test]
fn test_remove_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Add game
    client.add_game(&game_contract);
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

    let client = create_test_blendizzard(&env, &admin);

    // Verify initial admin
    assert_eq!(client.get_admin(), admin);

    // Change admin
    client.set_admin(&new_admin);

    // Verify new admin
    assert_eq!(client.get_admin(), new_admin);
}
