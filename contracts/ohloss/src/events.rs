use soroban_sdk::{contractevent, Address, Env};

// ============================================================================
// Event Definitions using #[contractevent] Macro
// ============================================================================
// All events are now defined using the modern #[contractevent] macro
// which provides type-safe event definitions and includes them in contract spec

// ============================================================================
// Admin Events
// ============================================================================

#[contractevent]
pub struct AdminChanged {
    pub old_admin: Address,
    pub new_admin: Address,
}

#[contractevent]
pub struct GameAdded {
    pub game_id: Address,
    pub developer: Address,
}

#[contractevent]
pub struct GameRemoved {
    pub game_id: Address,
}

#[contractevent]
pub struct ConfigUpdated {
    pub admin: Address,
}

// ============================================================================
// Vault Events (REMOVED - Players interact directly with fee-vault-v2)
// ============================================================================
//
// Deposit and Withdraw events have been removed because:
// - Players deposit/withdraw directly to fee-vault-v2
// - Ohloss no longer intermediates vault operations
// - Fee-vault-v2 emits its own events for these operations
//
// Monitor fee-vault-v2's vault_deposit and vault_withdraw events instead.

// ============================================================================
// Faction Events
// ============================================================================

#[contractevent]
pub struct FactionSelected {
    #[topic]
    pub player: Address,
    pub faction: u32,
}

// FactionLocked event REMOVED
// Rationale: Internal state change that happens during start_game()
// - Not a direct user action (faction selection already has FactionSelected event)
// - Causes 3 events per start_game() call (1 GameStarted + 2 FactionLocked)
// - Redundant: players are in GameStarted, factions queryable via get_epoch_player()
// - Clutters event stream with implementation details

#[contractevent]
pub struct TimeMultiplierReset {
    #[topic]
    pub player: Address,
    pub epoch: u32,
    pub previous_balance: i128,
    pub current_balance: i128,
    pub withdrawal_percentage: i128, // Fixed-point (SCALAR_7)
}

// ============================================================================
// Pause Events
// ============================================================================

#[contractevent]
pub struct ContractPaused {
    pub admin: Address,
    pub timestamp: u64,
}

#[contractevent]
pub struct ContractUnpaused {
    pub admin: Address,
    pub timestamp: u64,
}

// ============================================================================
// Game Events
// ============================================================================

#[contractevent]
pub struct GameStarted {
    #[topic]
    pub game_id: Address,
    #[topic]
    pub session_id: u32,
    pub player1: Address,
    pub player2: Address,
    pub player1_wager: i128,
    pub player2_wager: i128,
    pub player1_faction: u32,
    pub player2_faction: u32,
    pub player1_fp_remaining: i128,
    pub player2_fp_remaining: i128,
}

#[contractevent]
pub struct GameEnded {
    #[topic]
    pub game_id: Address,
    #[topic]
    pub session_id: u32,
    pub winner: Address,
    pub loser: Address,
    pub fp_contributed: i128, // Winner's FP that contributes to faction standings
}

// ============================================================================
// Epoch Events
// ============================================================================

#[contractevent]
pub struct EpochCycled {
    pub old_epoch: u32,
    pub new_epoch: u32,
    pub winning_faction: u32,
    pub reward_pool: i128,
}

#[contractevent]
pub struct RewardsClaimed {
    #[topic]
    pub player: Address,
    pub epoch: u32,
    pub faction: u32,
    pub amount: i128,
}

#[contractevent]
pub struct DevRewardClaimed {
    #[topic]
    pub developer: Address,
    pub epoch: u32,
    pub fp_contributed: i128,
    pub amount: i128,
}

// ============================================================================
// Event Emission Helper Functions
// ============================================================================

/// Emit admin changed event
pub(crate) fn emit_admin_changed(env: &Env, old_admin: &Address, new_admin: &Address) {
    AdminChanged {
        old_admin: old_admin.clone(),
        new_admin: new_admin.clone(),
    }
    .publish(env);
}

/// Emit game added event
pub(crate) fn emit_game_added(env: &Env, game_id: &Address, developer: &Address) {
    GameAdded {
        game_id: game_id.clone(),
        developer: developer.clone(),
    }
    .publish(env);
}

/// Emit game removed event
pub(crate) fn emit_game_removed(env: &Env, game_id: &Address) {
    GameRemoved {
        game_id: game_id.clone(),
    }
    .publish(env);
}

/// Emit config updated event
pub(crate) fn emit_config_updated(env: &Env, admin: &Address) {
    ConfigUpdated {
        admin: admin.clone(),
    }
    .publish(env);
}

/// Emit faction selected event
pub(crate) fn emit_faction_selected(env: &Env, player: &Address, faction: u32) {
    FactionSelected {
        player: player.clone(),
        faction,
    }
    .publish(env);
}

/// Emit time multiplier reset event
pub(crate) fn emit_time_multiplier_reset(
    env: &Env,
    player: &Address,
    epoch: u32,
    previous_balance: i128,
    current_balance: i128,
    withdrawal_percentage: i128,
) {
    TimeMultiplierReset {
        player: player.clone(),
        epoch,
        previous_balance,
        current_balance,
        withdrawal_percentage,
    }
    .publish(env);
}

/// Emit contract paused event
pub(crate) fn emit_contract_paused(env: &Env, admin: &Address) {
    ContractPaused {
        admin: admin.clone(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

/// Emit contract unpaused event
pub(crate) fn emit_contract_unpaused(env: &Env, admin: &Address) {
    ContractUnpaused {
        admin: admin.clone(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

/// Emit game started event
pub(crate) fn emit_game_started(
    env: &Env,
    game_id: &Address,
    session_id: u32,
    player1: &Address,
    player2: &Address,
    player1_wager: i128,
    player2_wager: i128,
    player1_faction: u32,
    player2_faction: u32,
    player1_fp_remaining: i128,
    player2_fp_remaining: i128,
) {
    GameStarted {
        game_id: game_id.clone(),
        session_id,
        player1: player1.clone(),
        player2: player2.clone(),
        player1_wager,
        player2_wager,
        player1_faction,
        player2_faction,
        player1_fp_remaining,
        player2_fp_remaining,
    }
    .publish(env);
}

/// Emit game ended event
pub(crate) fn emit_game_ended(
    env: &Env,
    game_id: &Address,
    session_id: u32,
    winner: &Address,
    loser: &Address,
    fp_contributed: i128,
) {
    GameEnded {
        game_id: game_id.clone(),
        session_id,
        winner: winner.clone(),
        loser: loser.clone(),
        fp_contributed,
    }
    .publish(env);
}

/// Emit epoch cycled event
pub(crate) fn emit_epoch_cycled(
    env: &Env,
    old_epoch: u32,
    new_epoch: u32,
    winning_faction: u32,
    reward_pool: i128,
) {
    EpochCycled {
        old_epoch,
        new_epoch,
        winning_faction,
        reward_pool,
    }
    .publish(env);
}

/// Emit rewards claimed event
pub(crate) fn emit_rewards_claimed(
    env: &Env,
    player: &Address,
    epoch: u32,
    faction: u32,
    amount: i128,
) {
    RewardsClaimed {
        player: player.clone(),
        epoch,
        faction,
        amount,
    }
    .publish(env);
}

/// Emit developer reward claimed event
pub(crate) fn emit_dev_reward_claimed(
    env: &Env,
    developer: &Address,
    epoch: u32,
    fp_contributed: i128,
    amount: i128,
) {
    DevRewardClaimed {
        developer: developer.clone(),
        epoch,
        fp_contributed,
        amount,
    }
    .publish(env);
}
