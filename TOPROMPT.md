* update epochs to per-hour
* add Launchtube as the tx submission endpoint

MAYBE
* Consider having loser fp added to winners faction_fp
* Consider having loser fp added to winners available_fp

SOMEDAY
* Use OZ Relayer to submit transactions
* Support smart wallets (use the OZ smart wallet interface)
* Review "Smooth Piecewise Multiplier System (Cubic Hermite Splines)". It's likely a bit expensive. The start_game function costs 0.05 XLM. Seems like we could bring that down a bit
* Add a feature in the fee-vault-v2 to deposit on behalf of another user (would make the claim_epoch_reward method cheaper)