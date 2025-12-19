/**
 * End-to-End Game Test
 *
 * This script demonstrates a complete game flow:
 * 1. Players deposit USDC to fee-vault
 * 2. Players select factions in ohloss
 * 3. Start a number-guess game (locks FP)
 * 4. Players make guesses
 * 5. Reveal winner (burns FP, updates faction standings)
 * 6. Verify results
 *
 * NOTE: This script assumes contracts are deployed and initialized.
 * See CHITSHEET.md for contract addresses.
 */

import { Client as OhlossContract, type Player, type EpochPlayer, type EpochInfo } from 'ohloss';
import { Client as FeeVaultContract } from 'fee-vault';
import { Client as NumberGuessContract, type Game } from 'number-guess';
import { Keypair, Networks, BASE_FEE, contract } from '@stellar/stellar-sdk';
import { Api } from '@stellar/stellar-sdk/rpc';

// Re-export types from contract and rpc modules
type AssembledTransaction<T> = contract.AssembledTransaction<T>;
type ClientOptions = contract.ClientOptions;

// ============================================================================
// Configuration
// ============================================================================

const NETWORK_PASSPHRASE = Networks.PUBLIC;
const RPC_URL = 'https://rpc.lightsail.network';
const SESSION_ID = undefined; // 749622;

// Default options for all contract method calls
// BASE_FEE is 100 stroops, so BASE_FEE + 1 = 101 stroops
const DEFAULT_METHOD_OPTIONS = {
  fee: Number(BASE_FEE) + 1, // 101 stroops
  timeoutInSeconds: 30,
} as const;

// Contract addresses from CHITSHEET.md
const OHLOSS_ID = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';
const FEE_VAULT_ID = 'CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y';
const NUMBER_GUESS_ID = 'CDB6IODG5BNNVILLJXBXYZVR7NP4HDO2NL7WALWIXGIDMA6VY4V75CEX';

// Player configuration
const PLAYER1_SECRET = process.env.PLAYER1_SECRET;
const PLAYER2_SECRET = process.env.PLAYER2_SECRET;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a contract client with the given keypair
 * Properly typed to preserve Client type information
 * Uses SDK's basicNodeSigner for consistent transaction and auth entry signing
 */
function createClient<T extends { new(options: ClientOptions): InstanceType<T> }>(
  ContractClass: T,
  contractId: string,
  keypair: Keypair
): InstanceType<T> {
  // Use SDK's basicNodeSigner for both transaction signing and auth entry signing
  const signer = contract.basicNodeSigner(keypair, NETWORK_PASSPHRASE);

  const options: ClientOptions = {
    contractId,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: keypair.publicKey(),
    ...signer, // Includes signTransaction and signAuthEntry
  };

  return new ContractClass(options) as InstanceType<T>;
}

/**
 * Format amounts for display (7 decimals for USDC on Stellar)
 */
function formatAmount(amount: bigint): string {
  return (Number(amount) / 10_000_000).toFixed(2);
}

/**
 * Execute write transaction with full workflow:
 * 1. Build and simulate
 * 2. Review simulation for errors
 * 3. Check authorization requirements
 * 4. Sign and send (with multi-sig support)
 *
 * @param additionalSigners - Optional map of address -> Keypair for multi-signature support
 */
async function logTx<T>(
  txPromise: Promise<AssembledTransaction<T>>,
  description: string,
  additionalSigners?: Map<string, Keypair>
): Promise<T> {
  console.log(`\n📤 ${description}...`);
  try {
    // 1. Build and auto-simulate the transaction
    const assembled = await txPromise;
    console.log(`   ✓ Transaction built and simulated`);

    // 2. Review simulation result using Api.isSimulationSuccess
    if (!Api.isSimulationSuccess(assembled.simulation)) {
      console.error(`   ✗ Simulation failed`);
      console.error(`   Error:`, assembled.simulation);
      throw new Error(`Simulation failed: ${JSON.stringify(assembled.simulation)}`);
    }
    console.log(`   ✓ Simulation successful`);

    // 3. Check for required signatures and sign auth entries with available keypairs
    const needsSigningBy = assembled.needsNonInvokerSigningBy();
    if (needsSigningBy.length > 0) {
      console.log(`   ⚠ Transaction requires additional signatures from:`, needsSigningBy);

      if (!additionalSigners) {
        throw new Error(`Multi-signature required but no additional signers provided. Required: ${needsSigningBy.join(', ')}`);
      }

      // Sign auth entries for each required signer
      const missingSigners: string[] = [];

      for (const requiredAddress of needsSigningBy) {
        const signer = additionalSigners.get(requiredAddress);
        if (signer) {
          console.log(`   ✓ Signing auth entries for ${requiredAddress}`);

          // Sign the authorization entries (not the transaction itself)
          // For non-invoker accounts, use the SDK's basicNodeSigner helper
          const nodeSigner = contract.basicNodeSigner(signer, NETWORK_PASSPHRASE);

          await assembled.signAuthEntries({
            address: requiredAddress,
            signAuthEntry: nodeSigner.signAuthEntry
          });

          console.log(`   ✓ Signed auth entries for ${signer.publicKey()}`);
        } else {
          console.log(`   ✗ No keypair available for ${requiredAddress}`);
          missingSigners.push(requiredAddress);
        }
      }

      if (missingSigners.length > 0) {
        throw new Error(`Missing keypairs for required signers: ${missingSigners.join(', ')}`);
      }

      console.log(`   ✓ All required auth entries signed`);
    } else {
      console.log(`   ✓ No additional signatures required`);
    }

    // 4. Sign and send the transaction (this will add the invoker's signature)
    console.log(`   ⏳ Signing and sending...`);
    const { result } = await assembled.signAndSend();
    console.log(`✅ ${description} - Success`);
    return result;
  } catch (error: any) {
    console.error(`❌ ${description} - Failed:`, error.message);
    throw error;
  }
}

/**
 * Execute read-only query with simulation review
 * Read operations don't require signing/sending, just simulation
 *
 * Generic type T represents the unwrapped value type
 * The contract methods return Result<T>, and this function unwraps to get T
 */
async function queryContract<T>(
  txPromise: Promise<AssembledTransaction<contract.Result<T>>>,
  description: string
): Promise<T> {
  try {
    // Build and auto-simulate the transaction
    const assembled = await txPromise;

    // Review simulation result using Api.isSimulationSuccess
    if (!Api.isSimulationSuccess(assembled.simulation)) {
      console.error(`Query simulation failed for "${description}"`);
      console.error(`Error:`, assembled.simulation);
      throw new Error(`Query simulation failed: ${JSON.stringify(assembled.simulation)}`);
    }

    // For read operations, just return the result from simulation
    // No need to sign and send - the simulation already contains the data
    // assembled.result is Result<T>, unwrap() returns T
    return assembled.result.unwrap();
  } catch (error: any) {
    console.error(`Failed to query "${description}":`, error.message);
    throw error;
  }
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  console.log('🎮 Ohloss End-to-End Game Test');
  console.log('=' .repeat(60));

  // Initialize players
  const player1 = Keypair.fromSecret(PLAYER1_SECRET);
  const player2 = Keypair.fromSecret(PLAYER2_SECRET);

  console.log('\n👥 Players:');
  console.log(`   Player 1: ${player1.publicKey()}`);
  console.log(`   Player 2: ${player2.publicKey()}`);

  // Create contract clients
  const ohloss1 = createClient(OhlossContract, OHLOSS_ID, player1);
  const ohloss2 = createClient(OhlossContract, OHLOSS_ID, player2);
  const feeVault1 = createClient(FeeVaultContract, FEE_VAULT_ID, player1);
  const feeVault2 = createClient(FeeVaultContract, FEE_VAULT_ID, player2);
  const numberGuess1 = createClient(NumberGuessContract, NUMBER_GUESS_ID, player1);
  const numberGuess2 = createClient(NumberGuessContract, NUMBER_GUESS_ID, player2);

  // Create signers map for multi-signature support
  // Add all available keypairs that might be needed for signing auth entries
  const signers = new Map<string, Keypair>();
  signers.set(player1.publicKey(), player1);
  signers.set(player2.publicKey(), player2);

  console.log(`\n🔑 Available signers: ${signers.size}`);

  // ============================================================================
  // Step 1: Deposit to Fee Vault
  // ============================================================================

  console.log('\n\n📦 Step 1: Deposit to Fee Vault');
  console.log('-'.repeat(60));

  const depositAmount = 100000n; // 0.0100000 USDC

  await logTx(
    feeVault1.deposit({
      user: player1.publicKey(),
      amount: depositAmount,
    }, DEFAULT_METHOD_OPTIONS),
    `Player 1 deposits ${formatAmount(depositAmount)} USDC`
  );

  await logTx(
    feeVault2.deposit({
      user: player2.publicKey(),
      amount: depositAmount,
    }, DEFAULT_METHOD_OPTIONS),
    `Player 2 deposits ${formatAmount(depositAmount)} USDC`
  );

  // ============================================================================
  // Step 2: Select Factions
  // ============================================================================

  console.log('\n\n⚔️  Step 2: Select Factions');
  console.log('-'.repeat(60));

  const FACTION_WHOLE_NOODLE = 0;
  const FACTION_POINTY_STICK = 1;

  await logTx(
    ohloss1.select_faction({
      player: player1.publicKey(),
      faction: FACTION_WHOLE_NOODLE,
    }, DEFAULT_METHOD_OPTIONS),
    'Player 1 selects WholeNoodle faction'
  );

  await logTx(
    ohloss2.select_faction({
      player: player2.publicKey(),
      faction: FACTION_POINTY_STICK,
    }, DEFAULT_METHOD_OPTIONS),
    'Player 2 selects PointyStick faction'
  );

  // ============================================================================
  // Step 3: Check Initial State
  // ============================================================================

  console.log('\n\n📊 Step 3: Check Initial State');
  console.log('-'.repeat(60));

  const player1Data = await queryContract<Player>(
    ohloss1.get_player({ player: player1.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 1 data'
  );
  const player2Data = await queryContract<Player>(
    ohloss2.get_player({ player: player2.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 2 data'
  );

  console.log(`\nPlayer 1:`);
  console.log(`   Faction: ${player1Data.selected_faction}`);
  console.log(`   Time Multiplier Start: ${player1Data.time_multiplier_start}`);

  console.log(`\nPlayer 2:`);
  console.log(`   Faction: ${player2Data.selected_faction}`);
  console.log(`   Time Multiplier Start: ${player2Data.time_multiplier_start}`);

  // ============================================================================
  // Step 4: Start Number Guess Game
  // ============================================================================

  console.log('\n\n🎲 Step 4: Start Number Guess Game');
  console.log('-'.repeat(60));

  // // Get current epoch (doesn't return Result type, so get directly)
  const currentEpochTx = await ohloss1.get_current_epoch(DEFAULT_METHOD_OPTIONS);
  const currentEpoch = currentEpochTx.result;

  // First, query each player's available FP
  const p1EpochBefore = await queryContract<EpochPlayer>(
    ohloss1.get_epoch_player({ epoch: currentEpoch, player: player1.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 1 epoch data'
  );
  const p2EpochBefore = await queryContract<EpochPlayer>(
    ohloss2.get_epoch_player({ epoch: currentEpoch, player: player2.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 2 epoch data'
  );

  console.log(p1EpochBefore);
  console.log(p2EpochBefore);

  console.log(`\n📊 FP State Before Game:`);
  console.log(`   Player 1 Available FP: ${formatAmount(BigInt(p1EpochBefore.available_fp))}`);
  console.log(`   Player 2 Available FP: ${formatAmount(BigInt(p2EpochBefore.available_fp))}`);

  // Use the minimum available FP as the wager
  const player1AvailableFP = BigInt(p1EpochBefore.available_fp);
  const player2AvailableFP = BigInt(p2EpochBefore.available_fp);
  const wager = player1AvailableFP < player2AvailableFP ? player1AvailableFP : player2AvailableFP;

  const sessionId = SESSION_ID || Math.floor(Math.random() * 1_000_000); // Random session ID

  console.log(`\nSession ID: ${sessionId}`);
  console.log(`Wager: ${formatAmount(wager)} FP (max both players can afford)`);

  await logTx(
    numberGuess1.start_game({
      session_id: sessionId,
      player1: player1.publicKey(),
      player2: player2.publicKey(),
      player1_wager: wager,
      player2_wager: wager,
    }, DEFAULT_METHOD_OPTIONS),
    'Start number guess game (locks FP via ohloss)',
    signers  // Pass signers map for multi-signature support
  );

  // Check FP state after game start
  const p1EpochAfterStart = await queryContract<EpochPlayer>(
    ohloss1.get_epoch_player({ epoch: currentEpoch, player: player1.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 1 epoch data after game start'
  );
  const p2EpochAfterStart = await queryContract<EpochPlayer>(
    ohloss2.get_epoch_player({ epoch: currentEpoch, player: player2.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 2 epoch data after game start'
  );

  console.log(`\n📊 FP State After Game Start:`);
  console.log(`   Player 1:`);
  console.log(`      Available FP: ${formatAmount(BigInt(p1EpochAfterStart.available_fp))}`);
  console.log(`   Player 2:`);
  console.log(`      Available FP: ${formatAmount(BigInt(p2EpochAfterStart.available_fp))}`);

  // ============================================================================
  // Step 5: Players Make Guesses
  // ============================================================================

  console.log('\n\n🤔 Step 5: Players Make Guesses');
  console.log('-'.repeat(60));

  const player1Guess = 5;
  const player2Guess = 7;

  await logTx(
    numberGuess1.make_guess({
      session_id: sessionId,
      player: player1.publicKey(),
      guess: player1Guess,
    }, DEFAULT_METHOD_OPTIONS),
    `Player 1 guesses: ${player1Guess}`
  );

  await logTx(
    numberGuess2.make_guess({
      session_id: sessionId,
      player: player2.publicKey(),
      guess: player2Guess,
    }, DEFAULT_METHOD_OPTIONS),
    `Player 2 guesses: ${player2Guess}`
  );

  // ============================================================================
  // Step 6: Reveal Winner
  // ============================================================================

  console.log('\n\n🏆 Step 6: Reveal Winner');
  console.log('-'.repeat(60));

  await logTx(
    numberGuess1.reveal_winner({
      session_id: sessionId,
    }, DEFAULT_METHOD_OPTIONS),
    'Reveal winner (burns FP, updates faction standings)'
  );

  // Get game result
  const gameResult = await queryContract<Game>(
    numberGuess1.get_game({
      session_id: sessionId
    }, DEFAULT_METHOD_OPTIONS),
    'Get game result'
  );

  console.log(`\n🎯 Game Result:`);
  console.log(`   Winning Number: ${gameResult.winning_number}`);
  console.log(`   Player 1 Guess: ${gameResult.player1_guess ?? 'not guessed'}`);
  console.log(`   Player 2 Guess: ${gameResult.player2_guess ?? 'not guessed'}`);
  console.log(`   Player 1 Wager: ${formatAmount(BigInt(gameResult.player1_wager))} FP`);
  console.log(`   Player 2 Wager: ${formatAmount(BigInt(gameResult.player2_wager))} FP`);

  // Handle Option<string> winner type
  const winnerAddress = gameResult.winner;
  const winnerName = winnerAddress === player1.publicKey() ? 'Player 1' :
                     winnerAddress === player2.publicKey() ? 'Player 2' :
                     'Unknown';
  console.log(`   Winner: ${winnerName} (${winnerAddress ?? 'no winner'})`);

  // ============================================================================
  // Step 7: Verify Final State
  // ============================================================================

  console.log('\n\n✅ Step 7: Verify Final State');
  console.log('-'.repeat(60));

  const p1EpochFinal = await queryContract<EpochPlayer>(
    ohloss1.get_epoch_player({ epoch: currentEpoch, player: player1.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 1 final epoch data'
  );
  const p2EpochFinal = await queryContract<EpochPlayer>(
    ohloss2.get_epoch_player({ epoch: currentEpoch, player: player2.publicKey() }, DEFAULT_METHOD_OPTIONS),
    'Get Player 2 final epoch data'
  );

  console.log(`\n📊 FP State After Game End:`);
  console.log(`   Player 1:`);
  console.log(`      Faction: ${p1EpochFinal.epoch_faction ?? 'none'}`);
  console.log(`      Initial Balance: ${formatAmount(BigInt(p1EpochFinal.epoch_balance_snapshot))} USDC`);
  console.log(`      Available FP: ${formatAmount(BigInt(p1EpochFinal.available_fp))}`);
  console.log(`      Total Contributed: ${formatAmount(BigInt(p1EpochFinal.total_fp_contributed))}`);
  console.log(`   Player 2:`);
  console.log(`      Faction: ${p2EpochFinal.epoch_faction ?? 'none'}`);
  console.log(`      Initial Balance: ${formatAmount(BigInt(p2EpochFinal.epoch_balance_snapshot))} USDC`);
  console.log(`      Available FP: ${formatAmount(BigInt(p2EpochFinal.available_fp))}`);
  console.log(`      Total Contributed: ${formatAmount(BigInt(p2EpochFinal.total_fp_contributed))}`);

  // Calculate what was spent (requires p1EpochBefore/p2EpochBefore from Step 4)
  console.log(`\n💸 FP Changes:`);
  console.log(`   Player 1 FP Spent: ${formatAmount(BigInt(p1EpochBefore.available_fp) - BigInt(p1EpochFinal.available_fp))}`);
  console.log(`   Player 2 FP Spent: ${formatAmount(BigInt(p2EpochBefore.available_fp) - BigInt(p2EpochFinal.available_fp))}`);

  // Get faction standings for the current epoch
  const epochInfo = await queryContract<EpochInfo>(
    ohloss1.get_epoch({ epoch: currentEpoch }, DEFAULT_METHOD_OPTIONS),
    `Get epoch ${currentEpoch} data`
  );

  console.log(`\n⚔️  Faction Standings (Epoch ${currentEpoch}):`);
  console.log(`   Raw faction_standings:`, epochInfo.faction_standings);

  // faction_standings is a Map<u32, i128>
  if (epochInfo.faction_standings && epochInfo.faction_standings.size > 0) {
    const factionEntries = Array.from(epochInfo.faction_standings.entries());
    for (const [factionId, points] of factionEntries) {
      const factionName = factionId === 0 ? 'WholeNoodle' : factionId === 1 ? 'PointyStick' : 'SpecialRock';
      console.log(`   ${factionName} (${factionId}): ${formatAmount(BigInt(points))} FP`);
    }
  } else {
    console.log(`   No faction standings yet (map is empty or null)`);
  }

  console.log(`\nEpoch Info:`);
  console.log(`   Start Time: ${new Date(Number(epochInfo.start_time) * 1000).toISOString()}`);
  console.log(`   End Time: ${new Date(Number(epochInfo.end_time) * 1000).toISOString()}`);
  console.log(`   Reward Pool: ${formatAmount(BigInt(epochInfo.reward_pool))} USDC`);

  console.log('\n\n🎉 End-to-End Test Complete!');
  console.log('=' .repeat(60));
}

// Run the script
main().catch((error) => {
  console.error('\n💥 Fatal Error:', error);
  process.exit(1);
});
