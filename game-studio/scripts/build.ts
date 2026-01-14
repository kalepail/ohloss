#!/usr/bin/env bun

/**
 * Build script for Soroban contracts
 *
 * Builds all Soroban contracts in this repo
 * using the stellar CLI with wasm32v1-none target
 */

import { $ } from "bun";
import { getWorkspaceContracts } from "./utils/contracts";

console.log("🔨 Building Soroban contracts...\n");

// Check if stellar CLI is available
try {
  await $`stellar --version`.quiet();
} catch (error) {
  console.error("❌ Error: stellar CLI not found");
  console.error("Please install it: https://developers.stellar.org/docs/tools/developer-tools");
  process.exit(1);
}

// Check if wasm32v1-none target is installed
try {
  const result = await $`rustup target list --installed`.text();
  if (!result.includes("wasm32v1-none")) {
    console.log("📦 Installing wasm32v1-none target...");
    await $`rustup target add wasm32v1-none`;
  }
} catch (error) {
  console.error("❌ Error checking Rust targets:", error);
  process.exit(1);
}

const contracts = await getWorkspaceContracts();

for (const contract of contracts) {
  console.log(`Building ${contract.packageName}...`);
  try {
    await $`stellar contract build --manifest-path ${contract.manifestPath}`;
    console.log(`✅ ${contract.packageName} built\n`);
  } catch (error) {
    console.error(`❌ Failed to build ${contract.packageName}:`, error);
    process.exit(1);
  }
}

console.log("🎉 All contracts built successfully!");
console.log("\nWASM files:");
for (const contract of contracts) {
  console.log(`  - ${contract.wasmPath}`);
}
