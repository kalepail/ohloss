# Free Play Feature Implementation Plan

## Status: ✅ COMPLETE

**Implementation completed:** All core functionality implemented and tested.
- Phase 1 (Contract Changes): ✅ Complete
- Phase 2 (Testing): ✅ Complete (115 tests passing)
- Phase 3 (Frontend): ✅ Complete
- Phase 4 (Documentation): Optional enhancements noted

---

## Overview

This document outlines the implementation of a "Free Play" feature that allows players to participate in Blendizzard games without an initial USDC deposit. Players receive a base allocation of Faction Points (FP) each epoch, but cannot claim rewards until they deposit a minimum threshold.

**Anti-Sybil Mechanism:** The deposit-to-claim requirement makes farming attacks economically unviable - each account needs real capital to extract value.

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Free FP + Deposit FP | **Additive** | Everyone gets 100 FP base, deposit-based FP stacks on top |
| Unclaimed rewards | **Expire with epoch** | Same behavior as all other players |
| Time multiplier | **Counts from free play** | Less special-casing, rewards early engagement |
| Free FP allocation | **Fresh each epoch** | Simple, per-epoch |
| Reward pool dilution | **Allow dilution** | Free players' shares count, expire if unclaimed |
| Minimum deposit threshold | **Binary (1 USDC)** | Must deposit full amount, no partial claims |
| Config updatability | **Via update_config** | Both `free_fp_per_epoch` and `min_deposit_to_claim` modifiable |

---

## Implementation Checklist

### Phase 1: Contract Changes ✅ COMPLETED

#### 1.1 Update Config Struct
**File:** `contracts/blendizzard/src/types.rs`

- [x] Add `free_fp_per_epoch: i128` field to `Config` struct
  - Default: `100_0000000` (100 FP with 7 decimals)
  - Comment: "Base FP granted to all players each epoch regardless of deposit"

- [x] Add `min_deposit_to_claim: i128` field to `Config` struct
  - Default: `1_0000000` (1 USDC with 7 decimals)
  - Comment: "Minimum vault balance required to claim epoch rewards"

**Updated Config struct:**
```rust
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// fee-vault-v2 contract address
    pub fee_vault: Address,

    /// Soroswap router contract address
    pub soroswap_router: Address,

    /// BLND token address
    pub blnd_token: Address,

    /// USDC token address
    pub usdc_token: Address,

    /// Duration of each epoch in seconds (default: 4 days = 345,600 seconds)
    pub epoch_duration: u64,

    /// Reserve token IDs for claiming BLND emissions from Blend pool
    pub reserve_token_ids: Vec<u32>,

    /// Base FP granted to all players each epoch regardless of deposit (7 decimals)
    /// Default: 100_0000000 (100 FP)
    pub free_fp_per_epoch: i128,

    /// Minimum vault balance required to claim epoch rewards (7 decimals)
    /// Default: 1_0000000 (1 USDC)
    pub min_deposit_to_claim: i128,
}
```

#### 1.2 Add New Error Type
**File:** `contracts/blendizzard/src/errors.rs`

- [x] Add `DepositRequiredToClaim` error variant
  - Error code: 43
  - Comment: "Player must deposit minimum amount to claim rewards"

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // ... existing errors ...

    /// Player must deposit minimum amount to claim rewards
    DepositRequiredToClaim = XX,
}
```

#### 1.3 Update Constructor
**File:** `contracts/blendizzard/src/lib.rs`

- [x] Add `free_fp_per_epoch: i128` parameter to `__constructor`
- [x] Add `min_deposit_to_claim: i128` parameter to `__constructor`
- [x] Update Config initialization to include new fields

**Updated constructor signature:**
```rust
pub fn __constructor(
    env: Env,
    admin: Address,
    fee_vault: Address,
    soroswap_router: Address,
    blnd_token: Address,
    usdc_token: Address,
    epoch_duration: u64,
    reserve_token_ids: Vec<u32>,
    free_fp_per_epoch: i128,      // NEW
    min_deposit_to_claim: i128,   // NEW
)
```

#### 1.4 Update `update_config` Function
**File:** `contracts/blendizzard/src/lib.rs`

- [x] Add `new_free_fp_per_epoch: Option<i128>` parameter
- [x] Add `new_min_deposit_to_claim: Option<i128>` parameter
- [x] Add handling code for both new parameters

**Updated function signature:**
```rust
pub fn update_config(
    env: Env,
    new_fee_vault: Option<Address>,
    new_soroswap_router: Option<Address>,
    new_blnd_token: Option<Address>,
    new_usdc_token: Option<Address>,
    new_epoch_duration: Option<u64>,
    new_reserve_token_ids: Option<Vec<u32>>,
    new_free_fp_per_epoch: Option<i128>,      // NEW
    new_min_deposit_to_claim: Option<i128>,   // NEW
) -> Result<(), Error>
```

**Add handling code:**
```rust
// Update free FP per epoch if provided
if let Some(free_fp) = new_free_fp_per_epoch {
    config.free_fp_per_epoch = free_fp;
}

// Update min deposit to claim if provided
if let Some(min_deposit) = new_min_deposit_to_claim {
    config.min_deposit_to_claim = min_deposit;
}
```

#### 1.5 Modify FP Calculation ✅ COMPLETED
**File:** `contracts/blendizzard/src/faction_points.rs`

- [x] Update `calculate_faction_points()` to add free FP base to all players

**Current logic (lines 54-78):**
```rust
pub(crate) fn calculate_faction_points(env: &Env, player: &Address) -> Result<i128, Error> {
    let player_data = storage::get_player(env, player).ok_or(Error::PlayerNotFound)?;
    let base_amount = crate::vault::get_vault_balance(env, player);

    // If no deposit, no faction points  <-- CHANGE THIS
    if base_amount == 0 {
        return Ok(0);
    }
    // ... rest of calculation
}
```

**New logic:**
```rust
pub(crate) fn calculate_faction_points(env: &Env, player: &Address) -> Result<i128, Error> {
    let player_data = storage::get_player(env, player).ok_or(Error::PlayerNotFound)?;
    let base_amount = crate::vault::get_vault_balance(env, player);
    let config = storage::get_config(env);

    // If no deposit, return only the free FP allocation
    if base_amount == 0 {
        return Ok(config.free_fp_per_epoch);
    }

    // Calculate deposit-based FP with multipliers
    let amount_mult = calculate_amount_multiplier(base_amount)?;
    let time_mult = calculate_time_multiplier(env, player_data.time_multiplier_start)?;
    let deposit_fp = calculate_fp_from_multipliers(base_amount, amount_mult, time_mult)?;

    // Total FP = free FP + deposit-based FP (additive)
    let total_fp = config.free_fp_per_epoch
        .checked_add(deposit_fp)
        .ok_or(Error::OverflowError)?;

    Ok(total_fp)
}
```

#### 1.6 Add Deposit Gate to Reward Claiming ✅ COMPLETED
**File:** `contracts/blendizzard/src/rewards.rs`

- [x] Add vault balance check before reward distribution
- [x] Return `DepositRequiredToClaim` error if below threshold

**Add after line 49 (after player.require_auth()):**
```rust
// Check minimum deposit requirement for claiming
let vault_balance = crate::vault::get_vault_balance(env, player);
let config = storage::get_config(env);

if vault_balance < config.min_deposit_to_claim {
    return Err(Error::DepositRequiredToClaim);
}
```

**Full updated function flow:**
```rust
pub(crate) fn claim_epoch_reward(env: &Env, player: &Address, epoch: u32) -> Result<i128, Error> {
    // Authenticate player
    player.require_auth();

    // NEW: Check minimum deposit requirement for claiming
    let vault_balance = crate::vault::get_vault_balance(env, player);
    let config = storage::get_config(env);

    if vault_balance < config.min_deposit_to_claim {
        return Err(Error::DepositRequiredToClaim);
    }

    // Check if already claimed
    if storage::has_claimed(env, player, epoch) {
        return Err(Error::RewardAlreadyClaimed);
    }

    // ... rest of existing logic unchanged
}
```

---

### Phase 2: Testing ✅ COMPLETED

#### 2.1 Unit Tests for Free FP Calculation
**File:** `contracts/blendizzard/src/tests/free_play_tests.rs`

- [x] Test: Zero deposit player receives exactly `free_fp_per_epoch`
- [x] Test: Deposited player receives `free_fp + calculated_fp` (additive)
- [x] Test: Free FP respects config value (not hardcoded)
- [x] Test: After `update_config`, new free FP value takes effect

```rust
#[test]
fn test_free_fp_for_zero_deposit_player() {
    // Setup: Player with faction selected but no vault deposit
    // Assert: calculate_faction_points returns config.free_fp_per_epoch
}

#[test]
fn test_fp_additive_for_deposited_player() {
    // Setup: Player with 100 USDC deposit
    // Assert: FP = free_fp + deposit_fp (both components present)
}

#[test]
fn test_free_fp_updates_via_config() {
    // Setup: Initialize with free_fp = 100
    // Action: update_config with new_free_fp = 200
    // Assert: New calculations use 200
}
```

#### 2.2 Integration Tests for Claim Gate
**File:** `contracts/blendizzard/src/tests/free_play_tests.rs`

- [x] Test: Free player in winning faction cannot claim (DepositRequiredToClaim)
- [x] Test: Free player who deposits can claim
- [x] Test: Player with deposit below threshold cannot claim
- [x] Test: Player at exactly threshold can claim
- [x] Test: Threshold respects config value

```rust
#[test]
fn test_free_player_cannot_claim_without_deposit() {
    // Setup: Free player plays games, contributes FP, faction wins
    // Action: Call claim_epoch_reward
    // Assert: Returns Error::DepositRequiredToClaim
}

#[test]
fn test_free_player_can_claim_after_deposit() {
    // Setup: Free player plays games, contributes FP, faction wins
    // Action: Player deposits 1 USDC, then calls claim_epoch_reward
    // Assert: Returns Ok(reward_amount)
}

#[test]
fn test_min_deposit_threshold_respects_config() {
    // Setup: Set min_deposit_to_claim to 5 USDC
    // Action: Player deposits 4 USDC, tries to claim
    // Assert: Returns Error::DepositRequiredToClaim
    // Action: Player deposits 1 more USDC (total 5), tries to claim
    // Assert: Returns Ok(reward_amount)
}
```

#### 2.3 Edge Case Tests

- [x] Test: Free player's FP contributes to faction standings
- [x] Test: Free player's unclaimed rewards expire with epoch
- [x] Test: Time multiplier starts counting from first free play game
- [x] Test: Multiple free players don't break reward math
- [x] Test: Config update mid-epoch doesn't retroactively change FP

```rust
#[test]
fn test_free_player_contributes_to_standings() {
    // Setup: Free player wins game, wager = 50 FP
    // Assert: faction_standings[player_faction] increased by 50
}

#[test]
fn test_time_multiplier_counts_from_first_game() {
    // Setup: Free player plays first game at T=0
    // Action: Advance time 35 days
    // Assert: time_multiplier at peak (2.449x)
    // Action: Player deposits 100 USDC
    // Assert: FP includes time multiplier boost
}
```

---

### Phase 3: Frontend Changes ✅ COMPLETED

#### 3.1 Reward Display Updates
**Location:** `frontend/src/components/RewardsClaim.tsx`

- [x] Show "locked" rewards for players below deposit threshold
- [x] Display message: "Deposit {min_deposit} USDC to unlock your rewards"
- [x] Show exact reward amount even when locked (motivates deposit)

**UI States:**
```
State A: No rewards (wrong faction or no contribution)
→ "No rewards available"

State B: Has rewards, meets deposit threshold
→ "$X.XX USDC" [Claim] button

State C: Has rewards, below deposit threshold
→ "$X.XX USDC (locked)"
→ "Deposit 1 USDC to unlock your rewards"
→ [Deposit] button (links to vault deposit flow)
```

#### 3.2 FP Display Updates
**Location:** Player dashboard / game lobby

- [x] Show total FP (cleaner UX approach chosen)

#### 3.3 Onboarding Flow
**Location:** New player flow

- [ ] Update messaging: "Play free! Earn rewards by depositing later." *(Future enhancement)*
- [ ] Add tooltip explaining free FP system *(Future enhancement)*
- [x] Clear CTA in VaultQuickActions: "Deposit to unlock reward claiming"

#### 3.4 Error Handling ✅ COMPLETED
**Location:** `frontend/src/components/RewardsClaim.tsx`

- [x] Catch `DepositRequiredToClaim` error (#43)
- [x] Show friendly message: "You need to deposit at least X USDC to claim rewards"
- [x] Display current vault balance and required amount

---

### Phase 4: Documentation Updates

#### 4.1 CLAUDE.md Updates
- [ ] Document free play mechanics in "Key Concepts" section *(Optional)*
- [ ] Update FP calculation documentation *(Optional)*
- [ ] Add `free_fp_per_epoch` and `min_deposit_to_claim` to config docs *(Optional)*

#### 4.2 PLAN.md Updates
- [ ] Add free play section to architecture docs *(Optional)*
- [ ] Document anti-sybil rationale *(Optional)*

*Note: This implementation document serves as the primary documentation for the free play feature.*

---

## Implementation Order

1. **Types & Errors** (5 min)
   - Add Config fields
   - Add error type

2. **Constructor & Update** (10 min)
   - Update `__constructor`
   - Update `update_config`

3. **FP Calculation** (15 min)
   - Modify `calculate_faction_points()`
   - Ensure additive behavior

4. **Claim Gate** (10 min)
   - Add deposit check to `claim_epoch_reward()`

5. **Tests** (30 min)
   - Unit tests for FP changes
   - Integration tests for claim gate
   - Edge case tests

6. **Frontend** (varies)
   - UI state updates
   - Error handling
   - Messaging

---

## Migration Notes

### Existing Deployments

If upgrading an existing deployment:

1. **Config Migration:** The new Config struct has additional fields. Options:
   - Deploy fresh contract with new constructor
   - Or: Add migration function that sets defaults for new fields

2. **Default Values:**
   ```rust
   free_fp_per_epoch: 100_0000000,   // 100 FP
   min_deposit_to_claim: 1_0000000,  // 1 USDC
   ```

3. **Backwards Compatibility:**
   - Existing deposited players unaffected (they get +100 FP bonus)
   - Existing zero-deposit players can now play (they get 100 FP)
   - Existing rewards claims: Check if any edge cases with in-flight claims

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sybil farming | Low | Medium | Deposit gate makes attack uneconomical |
| Reward pool dilution | Low | Low | Unclaimed rewards expire, natural cleanup |
| Config misconfiguration | Low | Medium | Validate inputs (no negative FP, reasonable thresholds) |
| Migration bugs | Medium | Medium | Thorough testing, staged rollout |

---

## Future Considerations

1. **Dynamic Free FP:** Adjust `free_fp_per_epoch` based on TVL or active players
2. **Tiered Free Play:** Different free FP amounts for verified vs unverified accounts
3. **Referral Bonuses:** Extra free FP for referred players
4. **Free Play Expiration:** Limit free play to first N epochs per account

---

## Appendix: Config Defaults

| Parameter | Default Value | Decimal Adjusted | Notes |
|-----------|--------------|------------------|-------|
| `free_fp_per_epoch` | `100_0000000` | 100 FP | ~1 USDC equivalent |
| `min_deposit_to_claim` | `1_0000000` | 1 USDC | Anti-sybil gate |
