#!/usr/bin/env bun

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readEnvFile } from './utils/env';

function usage() {
  console.log(`\nUsage: bun run publish <game-slug> [--out <dir>] [--force]\n`);
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function toEnvKey(slug: string): string {
  return slug.replace(/-/g, '_').toUpperCase();
}

function findGameComponent(gameDir: string): { fileBase: string; component: string; isDefault: boolean } {
  const entries = readdirSync(gameDir);
  const tsxFiles = entries.filter((name) => name.endsWith('.tsx'));
  if (tsxFiles.length === 0) {
    throw new Error(`No .tsx files found in ${gameDir}`);
  }

  const preferred = tsxFiles.find((name) => /Game\.tsx$/.test(name)) || tsxFiles[0];
  const fileBase = path.basename(preferred, '.tsx');
  const contents = readFileSync(path.join(gameDir, preferred), 'utf8');
  const isDefault = /export\s+default/.test(contents);

  if (isDefault) {
    return { fileBase, component: fileBase, isDefault };
  }

  const namedMatch = contents.match(/export\s+(?:function|const)\s+([A-Za-z0-9_]+)/);
  const component = namedMatch ? namedMatch[1] : fileBase;
  return { fileBase, component, isDefault };
}

function shouldSkip(name: string): boolean {
  const skipNames = new Set([
    'node_modules',
    'dist',
    'dist-node',
    '.turbo',
    '.git',
  ]);
  if (skipNames.has(name)) return true;
  if (name === 'tsconfig.tsbuildinfo') return true;
  return false;
}

function copyDir(src: string, dest: string) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      const contents = readFileSync(srcPath);
      writeFileSync(destPath, contents);
    }
  }
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const gameSlug = args[0];
const outIndex = args.indexOf('--out');
const force = args.includes('--force');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(studioRoot, '..');
const frontendRoot = path.join(studioRoot, 'frontend');
const gameDir = path.join(frontendRoot, 'src', 'games', gameSlug);

if (!existsSync(gameDir)) {
  const knownGames = existsSync(path.join(frontendRoot, 'src', 'games'))
    ? readdirSync(path.join(frontendRoot, 'src', 'games')).filter((name) =>
        statSync(path.join(frontendRoot, 'src', 'games', name)).isDirectory()
      )
    : [];
  console.error(`\n❌ Game not found: ${gameSlug}`);
  if (knownGames.length) {
    console.error(`Available games: ${knownGames.join(', ')}`);
  }
  process.exit(1);
}

const outputDir = outIndex >= 0
  ? path.resolve(process.cwd(), args[outIndex + 1])
  : path.join(repoRoot, gameSlug);

if (existsSync(outputDir)) {
  if (!force) {
    console.error(`\n❌ Output directory already exists: ${outputDir}`);
    console.error('Use --force to overwrite or remove it first.');
    process.exit(1);
  }
  rmSync(outputDir, { recursive: true, force: true });
}

console.log(`\n📦 Publishing ${gameSlug}...`);
copyDir(frontendRoot, outputDir);

const { fileBase, component: componentName, isDefault } = findGameComponent(gameDir);
const title = titleCaseFromSlug(gameSlug);
const envKey = toEnvKey(gameSlug);

const importLine = isDefault
  ? `import ${componentName} from './games/${gameSlug}/${fileBase}';`
  : `import { ${componentName} } from './games/${gameSlug}/${fileBase}';`;

const appTemplate = `import { config } from './config';
import { LayoutStandalone } from './components/LayoutStandalone';
import { useWalletStandalone } from './hooks/useWalletStandalone';
${importLine}

const GAME_ID = '${gameSlug}';
const GAME_TITLE = import.meta.env.VITE_GAME_TITLE || '${title}';
const GAME_TAGLINE = import.meta.env.VITE_GAME_TAGLINE || 'Zero-Loss Game on Stellar';

export default function App() {
  const { publicKey, isConnected, isConnecting, error, connect, isWalletAvailable } = useWalletStandalone();
  const userAddress = publicKey ?? '';
  const contractId = config.contractIds[GAME_ID] || '';
  const hasContract = contractId && contractId !== 'YOUR_CONTRACT_ID';

  return (
    <LayoutStandalone title={GAME_TITLE} subtitle={GAME_TAGLINE}>
      {!hasContract ? (
        <div className="card">
          <h3 className="gradient-text">Contract Not Configured</h3>
          <p style={{ color: 'var(--color-dim)', marginTop: '1rem' }}>
            Set the contract ID in <code>public/ohloss-config.js</code> (recommended) or in
            <code>VITE_${envKey}_CONTRACT_ID</code>.
          </p>
        </div>
      ) : !isConnected ? (
        <div className="card">
          <h3 className="gradient-text">Connect Wallet</h3>
          <p style={{ color: 'var(--color-dim)', marginTop: '0.75rem' }}>
            Connect your wallet to start playing.
          </p>
          {error && <div className="error" style={{ marginTop: '1rem' }}>{error}</div>}
          <div style={{ marginTop: '1.25rem' }}>
            <button
              onClick={() => connect().catch(() => undefined)}
              disabled={!isWalletAvailable || isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      ) : (
        <${componentName}
          userAddress={userAddress}
          currentEpoch={1}
          availableFP={1000000000n}
          onBack={() => {}}
          onStandingsRefresh={() => {}}
          onGameComplete={() => {}}
        />
      )}
    </LayoutStandalone>
  );
}
`;

writeFileSync(path.join(outputDir, 'src', 'App.tsx'), appTemplate);

// Ensure game uses standalone wallet hook
const walletShim = `export { useWalletStandalone as useWallet } from './useWalletStandalone';\n`;
writeFileSync(path.join(outputDir, 'src', 'hooks', 'useWallet.ts'), walletShim);

// Update Vite envDir to local .env
const vitePath = path.join(outputDir, 'vite.config.ts');
if (existsSync(vitePath)) {
  const viteText = readFileSync(vitePath, 'utf8');
  const updated = viteText.replace(/envDir:\s*['\"]\.\.['\"]/g, "envDir: '.'");
  writeFileSync(vitePath, updated);
}

// Inject runtime config script
const indexPath = path.join(outputDir, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  let updatedHtml = html;
  const scriptTag = '  <script src="/ohloss-config.js"></script>\n';
  if (!updatedHtml.includes('ohloss-config.js')) {
    updatedHtml = updatedHtml.replace(
      /\n\s*<script type="module" src="\/src\/main\.tsx"><\/script>/,
      `\n${scriptTag}    <script type="module" src="/src/main.tsx"></script>`
    );
  }

  if (updatedHtml.includes('<title>')) {
    updatedHtml = updatedHtml.replace(/<title>.*<\/title>/, `<title>${title}</title>`);
  }

  if (updatedHtml !== html) {
    writeFileSync(indexPath, updatedHtml);
  }
}

// Create runtime config file for easy updates post-deploy
const env = await readEnvFile(path.join(studioRoot, '.env'));
const fallbackRpc = 'https://soroban-mainnet.stellar.org';
const fallbackPassphrase = 'Public Global Stellar Network ; September 2015';
const rpcUrl = env.VITE_SOROBAN_RPC_URL || fallbackRpc;
const networkPassphrase = env.VITE_NETWORK_PASSPHRASE || fallbackPassphrase;
const contractId = env[`VITE_${envKey}_CONTRACT_ID`] || '';

const runtimeConfig = {
  rpcUrl,
  networkPassphrase,
  contractIds: {
    [gameSlug]: contractId,
  },
  simulationSourceAddress: env.VITE_SIMULATION_SOURCE_ADDRESS || '',
};

const configText = `window.__OHLOSS_CONFIG__ = ${JSON.stringify(runtimeConfig, null, 2)};\n`;

// Ensure public folder exists before writing runtime config
const publicDir = path.join(outputDir, 'public');
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}
writeFileSync(path.join(publicDir, 'ohloss-config.js'), configText);

console.log(`✅ Standalone frontend created at ${outputDir}`);
console.log('Next steps:');
console.log(`  1) cd ${outputDir}`);
console.log('  2) bun install');
console.log('  3) bun run dev');
console.log('  4) Update public/ohloss-config.js with your mainnet contract ID');
