import { existsSync } from "fs";

export type ContractInfo = {
  memberPath: string;
  manifestPath: string;
  packageName: string;
  wasmName: string;
  wasmPath: string;
  envKey: string;
  bindingsOutDir: string;
  isMockBlendizzard: boolean;
};

function toWasmName(packageName: string): string {
  return packageName.replaceAll("-", "_");
}

function toEnvKey(packageName: string): string {
  return toWasmName(packageName).toUpperCase();
}

export async function getWorkspaceContracts(): Promise<ContractInfo[]> {
  const rootText = await Bun.file("Cargo.toml").text();
  const rootToml = Bun.TOML.parse(rootText) as any;
  const members = (rootToml?.workspace?.members ?? []) as string[];

  if (!Array.isArray(members) || members.length === 0) {
    throw new Error("No workspace members found in root Cargo.toml");
  }

  const contractMembers = members.filter((m) => typeof m === "string" && m.startsWith("contracts/"));
  if (contractMembers.length === 0) {
    throw new Error("No contract workspace members found (expected paths under contracts/)");
  }

  const infos: ContractInfo[] = [];
  for (const memberPath of contractMembers) {
    const manifestPath = `${memberPath}/Cargo.toml`;
    if (!existsSync(manifestPath)) {
      throw new Error(`Workspace member missing Cargo.toml: ${manifestPath}`);
    }

    const manifestText = await Bun.file(manifestPath).text();
    const manifestToml = Bun.TOML.parse(manifestText) as any;
    const packageName = manifestToml?.package?.name as string | undefined;
    if (!packageName) {
      throw new Error(`Missing [package].name in ${manifestPath}`);
    }

    const wasmName = toWasmName(packageName);
    const envKey = toEnvKey(packageName);

    infos.push({
      memberPath,
      manifestPath,
      packageName,
      wasmName,
      wasmPath: `target/wasm32v1-none/release/${wasmName}.wasm`,
      envKey,
      bindingsOutDir: `bindings/${wasmName}`,
      isMockBlendizzard: packageName === "mock-blendizzard" || wasmName === "mock_blendizzard",
    });
  }

  infos.sort((a, b) => {
    if (a.isMockBlendizzard && !b.isMockBlendizzard) return -1;
    if (!a.isMockBlendizzard && b.isMockBlendizzard) return 1;
    return a.packageName.localeCompare(b.packageName);
  });

  return infos;
}

