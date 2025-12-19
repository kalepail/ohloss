* I want you to do a detailed audit of @frontend-v2 for code cleanliness. I want to ensure proper use of utilities and methods for best practices for projects like this. No duplicated code, keep things DRY, use methods provided by installed packages vs writing things by hand. The project might be in good shape already but I want you to do a deep audit and ensure things are clean, well organized, DRY and production ready

MAYBE
* Consider having loser fp added to winners faction_fp
* Consider having loser fp added to winners available_fp
* players can play themselves, this is dumb? The question is is it dangerous

SOMEDAY
* Use OZ Relayer to submit transactions
* Review "Smooth Piecewise Multiplier System (Cubic Hermite Splines)". It's likely a bit expensive. The start_game function costs 0.05 XLM. Seems like we could bring that down a bit
* Add a feature in the fee-vault-v2 to deposit on behalf of another user (would make the claim_epoch_reward method cheaper)
* Review support for WalletConnect so we could use mobile wallets like Lobstr and Freighter (currently doesn't support authEntry signing)