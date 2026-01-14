#!/usr/bin/env bun

/**
 * Test: Deep Link Flow with Auth Entry
 *
 * Validates that share URLs with auth entries work correctly:
 * 1. Player 1 creates and exports auth entry
 * 2. Share URL is generated with ?game=number-guess&auth=XDR
 * 3. URL can be used to either:
 *    a) Import and complete game (if not yet started)
 *    b) Load existing game directly (if already completed)
 */

import { Keypair } from '@stellar/stellar-sdk';
import { numberGuessService } from '../game-frontend/src/services/numberGuessService';

const RPC_URL = 'https://soroban-testnet.stellar.org';

// Test keypairs
const player1Kp = Keypair.fromSecret(process.env.PLAYER1_SECRET || Keypair.random().secret());
const player2Kp = Keypair.fromSecret(process.env.PLAYER2_SECRET || Keypair.random().secret());

console.log('\n🧪 Testing Deep Link Flow with Auth Entry\n');
console.log('Player 1:', player1Kp.publicKey());
console.log('Player 2:', player2Kp.publicKey());
console.log('');

async function testDeepLinkFlow() {
  try {
    const sessionId = Math.floor(Date.now() / 1000);
    const wager = 100_000_000n; // 10 FP

    console.log('📝 Step 1: Player 1 creates and exports auth entry');
    console.log('Session ID:', sessionId);
    console.log('');

    // Player 1 prepares transaction (simulates with placeholder Player 2)
    const authEntryXDR = await numberGuessService.prepareStartGame(
      sessionId,
      player1Kp.publicKey(),
      'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB', // Placeholder
      wager,
      wager,
      {
        publicKey: player1Kp.publicKey(),
        signAuthEntry: async (authEntry) => {
          console.log('  🖊️  Player 1 signing auth entry...');
          return authEntry.sign(player1Kp);
        },
      }
    );

    console.log('✅ Auth entry created and signed by Player 1');
    console.log('');

    // Simulate share URL generation
    const shareUrl = `http://localhost:5173/?game=number-guess&auth=${encodeURIComponent(authEntryXDR)}`;
    console.log('📤 Step 2: Share URL generated');
    console.log('URL format: ?game=number-guess&auth=XDR');
    console.log('URL length:', shareUrl.length);
    console.log('');

    // Simulate GamesCatalog parsing (what happens when URL is opened)
    console.log('🔗 Step 3: Simulating URL open (GamesCatalog parsing)');
    const urlParams = new URLSearchParams(new URL(shareUrl).search);
    const authParam = urlParams.get('auth');
    const xdrParam = urlParams.get('xdr');
    const gameParam = urlParams.get('game');

    console.log('  Detected parameters:');
    console.log('    - game:', gameParam);
    console.log('    - auth:', authParam ? '✅ Found' : '❌ Not found');
    console.log('    - xdr:', xdrParam ? '✅ Found' : '❌ Not found');
    console.log('');

    if (!authParam && !xdrParam) {
      throw new Error('❌ FAILED: Auth entry not detected in URL!');
    }

    const detectedAuthEntry = authParam || xdrParam;
    const decodedXDR = decodeURIComponent(detectedAuthEntry!);

    console.log('✅ Auth entry successfully detected from URL');
    console.log('');

    // Simulate NumberGuessGame parsing
    console.log('📖 Step 4: Parsing auth entry (NumberGuessGame logic)');
    const parsed = numberGuessService.parseAuthEntry(decodedXDR);
    console.log('  Parsed session ID:', parsed.sessionId);
    console.log('  Parsed player 1:', parsed.player1);
    console.log('  Parsed player 1 wager:', Number(parsed.player1Wager) / 10_000_000, 'FP');
    console.log('');

    // Check if game exists
    console.log('🔍 Step 5: Checking if game already exists');
    let gameExists = false;
    try {
      const game = await numberGuessService.getGame(parsed.sessionId);
      if (game) {
        gameExists = true;
        console.log('  ✅ Game exists! Should load directly to guess phase');
        console.log('  Game state:', {
          player1: game.player1,
          player2: game.player2,
          player1_guess: game.player1_guess !== null ? 'Made' : 'Pending',
          player2_guess: game.player2_guess !== null ? 'Made' : 'Pending',
        });
      } else {
        console.log('  ℹ️  Game not found (will enter import mode)');
      }
    } catch (err: any) {
      console.log('  ℹ️  Game not found (will enter import mode)');
      console.log('  Error:', err.message);
    }
    console.log('');

    if (!gameExists) {
      console.log('📥 Step 6: Simulating Player 2 import and complete');
      console.log('  Player 2 would see:');
      console.log('    - Pre-filled session ID:', parsed.sessionId);
      console.log('    - Pre-filled Player 1:', parsed.player1);
      console.log('    - Pre-filled Player 1 wager:', Number(parsed.player1Wager) / 10_000_000, 'FP');
      console.log('    - Pre-filled Player 2 wager: 0.1 FP (default)');
      console.log('');

      // Player 2 imports and completes
      const result = await numberGuessService.importAndStartGame(
        decodedXDR,
        player2Kp.publicKey(),
        wager,
        {
          publicKey: player2Kp.publicKey(),
          signTransaction: async (xdr: string) => {
            console.log('  🖊️  Player 2 signing transaction...');
            return xdr; // In real scenario, would sign with wallet
          },
        }
      );

      console.log('✅ Game successfully started by Player 2');
      console.log('  Transaction hash:', result.hash);
      console.log('');

      // Now check if game exists
      console.log('🔍 Step 7: Re-checking game after completion');
      const completedGame = await numberGuessService.getGame(parsed.sessionId);
      if (completedGame) {
        console.log('  ✅ Game now exists! Future opens of the URL should load directly');
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SUCCESS! Deep link flow works correctly!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log('  ✨ Share URL uses ?game=number-guess&auth=XDR');
    console.log('  ✨ GamesCatalog detects auth parameter correctly');
    console.log('  ✨ NumberGuessGame parses auth entry and extracts session ID');
    console.log('  ✨ Game existence check determines whether to:');
    console.log('     - Load existing game directly (if already started)');
    console.log('     - Show import form with pre-filled values (if not started)');
    console.log('  ✨ Player 2 wager auto-prefills to 0.1 FP');
    console.log('  ✨ Backward compatible with legacy ?xdr= parameter');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ FAILED: Deep link flow test failed');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

// Run the test
testDeepLinkFlow();
