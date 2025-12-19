#!/usr/bin/env bun

/**
 * Generate TypeScript bindings for contracts
 *
 * Generates type-safe client bindings from deployed contracts
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { readEnvFile, getEnvValue } from "./utils/env";
import { getWorkspaceContracts } from "./utils/contracts";

console.log("📦 Generating TypeScript bindings...\n");

const contracts = await getWorkspaceContracts();
const contractIds: Record<string, string> = {};

if (existsSync("deployment.json")) {
  const deploymentInfo = await Bun.file("deployment.json").json();
  if (deploymentInfo?.contracts && typeof deploymentInfo.contracts === 'object') {
    Object.assign(contractIds, deploymentInfo.contracts);
  } else {
    // Backwards compatible fallback
    if (deploymentInfo?.mockBlendizzardId) contractIds["mock-blendizzard"] = deploymentInfo.mockBlendizzardId;
    if (deploymentInfo?.twentyOneId) contractIds["twenty-one"] = deploymentInfo.twentyOneId;
    if (deploymentInfo?.numberGuessId) contractIds["number-guess"] = deploymentInfo.numberGuessId;
  }
} else {
  const env = await readEnvFile('.env');
  for (const contract of contracts) {
    contractIds[contract.packageName] = getEnvValue(env, `VITE_${contract.envKey}_CONTRACT_ID`);
  }
}

const missing: string[] = [];
for (const contract of contracts) {
  const id = contractIds[contract.packageName];
  if (!id) missing.push(`VITE_${contract.envKey}_CONTRACT_ID`);
}

if (missing.length > 0) {
  console.error("❌ Error: Missing contract IDs (need either deployment.json or .env):");
  for (const k of missing) console.error(`  - ${k}`);
  process.exit(1);
}

for (const contract of contracts) {
  const contractId = contractIds[contract.packageName];
  console.log(`Generating bindings for ${contract.packageName}...`);
  try {
    await $`stellar contract bindings typescript --contract-id ${contractId} --output-dir ${contract.bindingsOutDir} --network testnet --overwrite`;
    console.log(`✅ ${contract.packageName} bindings generated\n`);
  } catch (error) {
    console.error(`❌ Failed to generate ${contract.packageName} bindings:`, error);
    process.exit(1);
  }
}

console.log("🎉 Bindings generated successfully!");
console.log("\nGenerated files:");
for (const contract of contracts) {
  console.log(`  - ${contract.bindingsOutDir}/`);
}
