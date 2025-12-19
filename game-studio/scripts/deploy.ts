#!/usr/bin/env bun

/**
 * Deploy script for Soroban contracts to testnet
 *
 * Deploys Soroban contracts to testnet
 * Returns the deployed contract IDs
 */

import { $ } from "bun";
import { Keypair } from '@stellar/stellar-sdk';
import { existsSync } from 'fs';
import { readEnvFile, getEnvValue } from './utils/env';
import { getWorkspaceContracts } from "./utils/contracts";

console.log("🚀 Deploying contracts to Stellar testnet...\n");

const NETWORK = 'testnet';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

async function testnetAccountExists(address: string): Promise<boolean> {
  const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`, { method: 'GET' });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Horizon error ${res.status} checking ${address}`);
  return true;
}

async function ensureTestnetFunded(address: string): Promise<void> {
  if (await testnetAccountExists(address)) return;
  console.log(`💰 Funding ${address} via friendbot...`);
  const fundRes = await fetch(`https://friendbot.stellar.org?addr=${address}`, { method: 'GET' });
  if (!fundRes.ok) {
    throw new Error(`Friendbot funding failed (${fundRes.status}) for ${address}`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 750));
    if (await testnetAccountExists(address)) return;
  }
  throw new Error(`Funded ${address} but it still doesn't appear on Horizon yet`);
}

const contracts = await getWorkspaceContracts();

// Check required files exist
const missingWasm: string[] = [];
for (const contract of contracts) {
  if (!await Bun.file(contract.wasmPath).exists()) missingWasm.push(contract.wasmPath);
}
if (missingWasm.length > 0) {
  console.error("❌ Error: Missing WASM build outputs:");
  for (const p of missingWasm) console.error(`  - ${p}`);
  console.error("\nRun 'bun run build' first");
  process.exit(1);
}

// Create three testnet identities: admin, player1, player2
// Only admin needs to be in the Stellar CLI for deployment
// Player1 and player2 are just keypairs for frontend use
const walletAddresses: Record<string, string> = {};
const walletSecrets: Record<string, string> = {};

// Load existing secrets from .env if available
let existingSecrets: Record<string, string | null> = {
  admin: null,
  player1: null,
  player2: null,
};

const existingEnv = await readEnvFile('.env');
for (const identity of ['admin', 'player1', 'player2']) {
  const key = `VITE_DEV_${identity.toUpperCase()}_SECRET`;
  const v = getEnvValue(existingEnv, key);
  if (v && v !== 'NOT_AVAILABLE') existingSecrets[identity] = v;
}

// Handle admin identity (needs to be in Stellar CLI for deployment)
console.log('Setting up admin identity...');
try {
  let adminKeypair: Keypair;

  // Check if we have an existing admin secret
  if (existingSecrets.admin) {
    console.log('✅ Using existing admin identity from .env');
    adminKeypair = Keypair.fromSecret(existingSecrets.admin);
  } else {
    console.log('📝 Generating new admin identity...');
    adminKeypair = Keypair.random();
  }

  const adminPublic = adminKeypair.publicKey();
  const adminSecret = adminKeypair.secret();

  walletAddresses.admin = adminPublic;
  walletSecrets.admin = adminSecret;

  // Check if admin is already in Stellar CLI
  try {
    const existingAddress = (await $`stellar keys address admin`.text()).trim();
    if (existingAddress !== adminPublic) {
      console.log('⚠️  Admin identity exists but address mismatch, recreating...');
      await $`stellar keys rm admin`;
      throw new Error('Need to recreate');
    }
    console.log(`✅ Admin identity in CLI: ${adminPublic}`);
  } catch {
    // Need to add admin to CLI
    // Since we can't easily add by secret key, generate a new one and use that
    if (!existingSecrets.admin) {
      // First ensure admin is removed
      try {
        await $`stellar keys rm admin`.quiet();
      } catch {}

      // Generate new identity in CLI
      console.log('Generating new admin identity in Stellar CLI...');
      await $`stellar keys generate admin --network testnet --fund`.quiet();
      const newAddress = (await $`stellar keys address admin`.text()).trim();
      walletAddresses.admin = newAddress;
      // We can't get the secret from CLI, so mark as NOT_AVAILABLE
      // User will need to fund this manually
      console.log(`✅ Admin identity created in CLI: ${newAddress}`);
      console.log(`⚠️  Admin secret not available - deploy will use CLI signer`);
      walletSecrets.admin = 'NOT_AVAILABLE';
    } else {
      throw new Error('Cannot add existing admin secret to CLI - please use stellar keys generate admin --network testnet manually');
    }
  }
} catch (error) {
  console.error(`❌ Failed to setup admin identity:`, error);
  process.exit(1);
}

// Handle player identities (don't need to be in CLI, just keypairs)
for (const identity of ['player1', 'player2']) {
  console.log(`Setting up ${identity}...`);

  let keypair: Keypair;
  if (existingSecrets[identity]) {
    console.log(`✅ Using existing ${identity} from .env`);
    keypair = Keypair.fromSecret(existingSecrets[identity]!);
  } else {
    console.log(`📝 Generating new ${identity}...`);
    keypair = Keypair.random();
  }

  walletAddresses[identity] = keypair.publicKey();
  walletSecrets[identity] = keypair.secret();
  console.log(`✅ ${identity}: ${keypair.publicKey()}`);

  // Ensure player accounts exist on testnet (even if reusing keys from .env)
  try {
    await ensureTestnetFunded(keypair.publicKey());
    console.log(`✅ ${identity} funded\n`);
  } catch (error) {
    console.warn(`⚠️  Warning: Failed to ensure ${identity} is funded, continuing anyway...`);
  }
}

// Save to deployment.json with secrets for setup script to use
console.log("🔐 Secret keys will be saved to .env (gitignored)\n");

console.log("💼 Wallet addresses:");
console.log(`  Admin:   ${walletAddresses.admin}`);
console.log(`  Player1: ${walletAddresses.player1}`);
console.log(`  Player2: ${walletAddresses.player2}\n`);

// Use admin identity for contract deployment
const adminAddress = walletAddresses.admin;

const deployed: Record<string, string> = {};

// Deploy mock first so we can pass it into game constructors
const mock = contracts.find((c) => c.isMockBlendizzard);
if (!mock) {
  console.error("❌ Error: mock-blendizzard contract not found in workspace members");
  process.exit(1);
}

console.log(`Deploying ${mock.packageName}...`);
let mockBlendizzardId = "";
try {
  const result = await $`stellar contract deploy --wasm ${mock.wasmPath} --source admin --network ${NETWORK}`.text();
  mockBlendizzardId = result.trim();
  deployed[mock.packageName] = mockBlendizzardId;
  console.log(`✅ ${mock.packageName} deployed: ${mockBlendizzardId}\n`);
} catch (error) {
  console.error(`❌ Failed to deploy ${mock.packageName}:`, error);
  process.exit(1);
}

for (const contract of contracts) {
  if (contract.isMockBlendizzard) continue;

  console.log(`Deploying ${contract.packageName}...`);
  try {
    console.log("  Installing WASM...");
    const installResult =
      await $`stellar contract install --wasm ${contract.wasmPath} --source admin --network ${NETWORK}`.text();
    const wasmHash = installResult.trim();
    console.log(`  WASM hash: ${wasmHash}`);

    console.log("  Deploying and initializing...");
    const deployResult =
      await $`stellar contract deploy --wasm-hash ${wasmHash} --source admin --network ${NETWORK} -- --admin ${adminAddress} --blendizzard ${mockBlendizzardId}`.text();
    const contractId = deployResult.trim();
    deployed[contract.packageName] = contractId;
    console.log(`✅ ${contract.packageName} deployed: ${contractId}\n`);
  } catch (error) {
    console.error(`❌ Failed to deploy ${contract.packageName}:`, error);
    process.exit(1);
  }
}

console.log("🎉 Deployment complete!\n");
console.log("Contract IDs:");
for (const contract of contracts) {
  const id = deployed[contract.packageName];
  if (id) console.log(`  ${contract.packageName}: ${id}`);
}

const twentyOneId = deployed["twenty-one"] || "";
const numberGuessId = deployed["number-guess"] || "";

const deploymentInfo = {
  mockBlendizzardId,
  twentyOneId,
  numberGuessId,
  contracts: deployed,
  network: NETWORK,
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  wallets: {
    admin: walletAddresses.admin,
    player1: walletAddresses.player1,
    player2: walletAddresses.player2,
  },
  deployedAt: new Date().toISOString(),
};

await Bun.write('deployment.json', JSON.stringify(deploymentInfo, null, 2) + '\n');
console.log("\n✅ Wrote deployment info to deployment.json");

const contractEnvLines = contracts
  .map((c) => `VITE_${c.envKey}_CONTRACT_ID=${deployed[c.packageName] || ""}`)
  .join("\n");

const envContent = `# Auto-generated by deploy script
# Do not edit manually - run 'bun run deploy' (or 'bun run setup') to regenerate
# WARNING: This file contains secret keys. Never commit to git!

VITE_SOROBAN_RPC_URL=${RPC_URL}
VITE_NETWORK_PASSPHRASE=${NETWORK_PASSPHRASE}
${contractEnvLines}

# Dev wallet addresses for testing
VITE_DEV_ADMIN_ADDRESS=${walletAddresses.admin}
VITE_DEV_PLAYER1_ADDRESS=${walletAddresses.player1}
VITE_DEV_PLAYER2_ADDRESS=${walletAddresses.player2}

# Dev wallet secret keys (WARNING: Never commit this file!)
VITE_DEV_ADMIN_SECRET=${walletSecrets.admin}
VITE_DEV_PLAYER1_SECRET=${walletSecrets.player1}
VITE_DEV_PLAYER2_SECRET=${walletSecrets.player2}
`;

await Bun.write('.env', envContent + '\n');
console.log("✅ Wrote secrets to .env (gitignored)");

export { mockBlendizzardId, deployed };
