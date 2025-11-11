* nuke `get_claimable_amount`. We should be able to get that by simulating `claim_epoch_reward`
* nuke `has_claimed_rewards`. We should be able to get that by simulating `claim_epoch_reward`
* nuke `is_faction_locked`. There's better ways to look this up (like by simulating `get_epoch_player`)
* nuke `get_reward_pool`. Just use `get_epoch`