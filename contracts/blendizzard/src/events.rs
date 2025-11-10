use soroban_sdk::{contractevent, Address, BytesN, Env};

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
// Vault Events (REMOVED - Users interact directly with fee-vault-v2)
// ============================================================================
//
// Deposit and Withdraw events have been removed because:
// - Users deposit/withdraw directly to fee-vault-v2
// - Blendizzard no longer intermediates vault operations
// - Fee-vault-v2 emits its own events for these operations
//
// Monitor fee-vault-v2's vault_deposit and vault_withdraw events instead.

// ============================================================================
// Faction Events
// ============================================================================

#[contractevent]
pub struct FactionSelected {
    #[topic]
    pub user: Address,
    pub faction: u32,
}

#[contractevent]
pub struct FactionLocked {
    #[topic]
    pub user: Address,
    pub epoch: u32,
    pub faction: u32,
}

// ============================================================================
// Game Events
// ============================================================================

#[contractevent]
pub struct GameStarted {
    #[topic]
    pub game_id: Address,
    #[topic]
    pub session_id: BytesN<32>,
    pub player1: Address,
    pub player2: Address,
    pub player1_wager: i128,
    pub player2_wager: i128,
}

#[contractevent]
pub struct GameEnded {
    #[topic]
    pub game_id: Address,
    #[topic]
    pub session_id: BytesN<32>,
    pub winner: Address,
    pub loser: Address,
    pub fp_contributed: i128,  // Winner's FP that contributes to faction standings
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
    pub user: Address,
    pub epoch: u32,
    pub faction: u32,
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
pub(crate) fn emit_game_added(env: &Env, game_id: &Address) {
    GameAdded {
        game_id: game_id.clone(),
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
pub(crate) fn emit_faction_selected(env: &Env, user: &Address, faction: u32) {
    FactionSelected {
        user: user.clone(),
        faction,
    }
    .publish(env);
}

/// Emit faction locked event (for epoch)
pub(crate) fn emit_faction_locked(env: &Env, user: &Address, epoch: u32, faction: u32) {
    FactionLocked {
        user: user.clone(),
        epoch,
        faction,
    }
    .publish(env);
}

/// Emit game started event
pub(crate) fn emit_game_started(
    env: &Env,
    game_id: &Address,
    session_id: &BytesN<32>,
    player1: &Address,
    player2: &Address,
    player1_wager: i128,
    player2_wager: i128,
) {
    GameStarted {
        game_id: game_id.clone(),
        session_id: session_id.clone(),
        player1: player1.clone(),
        player2: player2.clone(),
        player1_wager,
        player2_wager,
    }
    .publish(env);
}

/// Emit game ended event
pub(crate) fn emit_game_ended(
    env: &Env,
    game_id: &Address,
    session_id: &BytesN<32>,
    winner: &Address,
    loser: &Address,
    fp_contributed: i128,
) {
    GameEnded {
        game_id: game_id.clone(),
        session_id: session_id.clone(),
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
pub(crate) fn emit_rewards_claimed(env: &Env, user: &Address, epoch: u32, faction: u32, amount: i128) {
    RewardsClaimed {
        user: user.clone(),
        epoch,
        faction,
        amount,
    }
    .publish(env);
}
