import { useState } from 'react';
import { ExternalLink, Github } from 'lucide-react';
import './Resources.css';

export type DocSection = 'quickstart' | 'create' | 'import' | 'export';

export function Resources() {
  const [activeSection, setActiveSection] = useState<DocSection>('quickstart');

  const handleNavClick = (section: DocSection) => {
    setActiveSection(section);
  };

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="resources-page">
      {/* Sidebar Navigation */}
      <aside className="resources-sidebar">
        <div className="sidebar-content">
          <h3 className="sidebar-title">Documentation</h3>

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeSection === 'quickstart' ? 'active' : ''}`}
              onClick={() => handleNavClick('quickstart')}
            >
              <span className="nav-icon">🚀</span>
              Quickstart
            </button>

            <button
              className={`nav-item ${activeSection === 'create' ? 'active' : ''}`}
              onClick={() => handleNavClick('create')}
            >
              <span className="nav-icon">✨</span>
              Create a New Game
            </button>

            <button
              className={`nav-item ${activeSection === 'import' ? 'active' : ''}`}
              onClick={() => handleNavClick('import')}
            >
              <span className="nav-icon">📥</span>
              Import a Game
            </button>

            <button
              className={`nav-item ${activeSection === 'export' ? 'active' : ''}`}
              onClick={() => handleNavClick('export')}
            >
              <span className="nav-icon">📢</span>
              Publish a Game
            </button>
          </nav>

          <div className="sidebar-divider"></div>

          <h3 className="sidebar-title">External Links</h3>

          <nav className="sidebar-nav">
            <button
              className="nav-item external"
              onClick={() => handleExternalLink('https://ohloss.com')}
            >
              <span className="nav-icon" aria-hidden="true">🌐</span>
              <span className="nav-label">OHLOSS.com</span>
              <span className="external-icon" aria-hidden="true">
                <ExternalLink size={16} />
              </span>
            </button>

            <button
              className="nav-item external"
              onClick={() => handleExternalLink('https://github.com/kalepail/ohloss')}
            >
              <span className="nav-icon" aria-hidden="true">
                <Github size={18} />
              </span>
              <span className="nav-label">OHLOSS</span>
              <span className="external-icon" aria-hidden="true">
                <ExternalLink size={16} />
              </span>
            </button>

            <button
              className="nav-item external"
              onClick={() => handleExternalLink('https://github.com/jamesbachini/ohloss-game-studio')}
            >
              <span className="nav-icon" aria-hidden="true">
                <Github size={18} />
              </span>
              <span className="nav-label">Game Studio</span>
              <span className="external-icon" aria-hidden="true">
                <ExternalLink size={16} />
              </span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="resources-content">
        <DocumentationContent section={activeSection} />
      </main>
    </div>
  );
}

export function DocumentationContent({ section }: { section: DocSection }) {
  if (section === 'quickstart') return <QuickstartSection />;
  if (section === 'create') return <CreateGameSection />;
  if (section === 'import') return <ImportGameSection />;
  return <ExportGameSection />;
}

function QuickstartSection() {
  return (
    <div className="doc-section">
      <h1 className="doc-title">Quickstart Guide</h1>
      <p className="doc-subtitle">
        Get up and running with OHLOSS Game Studio in minutes
      </p>

      <div className="doc-content">
        <section className="content-block">
          <h2>Prerequisites</h2>
          <p>Before you begin, ensure you have the following installed:</p>
          <ul>
            <li><strong><a href="https://bun.sh/" target="_blank">Bun</a></strong> - For running scripts and the frontend</li>
            <li><strong><a href="https://www.rust-lang.org/" target="_blank">Rust & Cargo</a></strong> - For building Soroban smart contracts</li>
            <li><strong><a href="https://developers.stellar.org/docs/tools/developer-tools" target="_blank">Stellar CLI</a></strong> - For contract deployment</li>
            <li><strong>wasm32v1-none target</strong> - Rust compilation target</li>
          </ul>
          <div className="code-block">
            <pre>
              <code>{`curl -fsSL https://bun.sh/install | bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --locked stellar-cli --features opt
rustup target add wasm32v1-none`}</code>
            </pre>
          </div>
          <div className="info-box">
            <div className="info-icon">🪟</div>
            <div>
              <strong>Windows Note</strong>
              <p>
                The commands in these docs assume a Unix-like shell (macOS/Linux). On Windows, use Windows Subsystem For Linux (WSL)
                to run <code>bun</code>, <code>cargo</code>, and <code>stellar</code> reliably.
              </p>
            </div>
          </div>
        </section>

        <section className="content-block">
          <h2>One-Command Setup</h2>
          <p>Run the automated setup script to build, deploy, and start the development server:</p>
          <div className="code-block">
            <pre>
              <code>{`bun run setup`}</code>
            </pre>
          </div>
          <div className="info-box">
            <div className="info-icon">ℹ️</div>
            <div>
              <strong>What happens during setup?</strong>
              <p>The setup script will:</p>
              <ol>
                <li>Build all Soroban contracts to WASM</li>
                <li>Create admin, player1 and player2 testnet accounts</li>
                <li>Deploy contracts to Stellar testnet</li>
                <li>Generate TypeScript bindings</li>
                <li>Configure environment variables</li>
                <li>Install frontend dependencies</li>
                <li>Start the dev server at localhost:3000</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CreateGameSection() {
  return (
    <div className="doc-section">
      <h1 className="doc-title">Create a New Game</h1>
      <p className="doc-subtitle">
        Build and integrate custom Soroban games with OHLOSS
      </p>

      <div className="doc-content">
        <section className="content-block">
          <h2>Overview</h2>
          <p>
            Creating a new game in OHLOSS Game Studio involves building a Soroban smart contract
            and frontend that integrates with the OHLOSS ecosystem.
          </p>
        </section>

        <section className="content-block">
          <h2>Files You'll Need to Modify</h2>
          <p>After creating your game contract, add it to the Cargo workspace and wire it into the frontend. The build/deploy/bindings/setup scripts auto-discover contracts from the workspace, so you don’t need to edit those scripts when adding games.</p>
          <ul>
            <li><code>Cargo.toml</code> (root) - Add to workspace</li>
            <li><code>frontend/src/games/&lt;your-game&gt;/</code> - Add your game UI + service</li>
            <li><code>frontend/src/components/GamesCatalog.tsx</code> - Add to catalog/routing</li>
          </ul>
        </section>

        <section className="content-block">
          <h2>Step 1: Copy the Template</h2>
          <p>Start by copying an existing game contract as a template:</p>
          <div className="code-block">
            <pre>
              <code>{`cp -r contracts/number-guess contracts/my-game`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 2: Update Contract Configuration</h2>
          <p>Edit <code>contracts/my-game/Cargo.toml</code> to update the package name:</p>
          <div className="code-block">
            <pre>
              <code>{`[package]
name = "my-game"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]
doctest = false

[dependencies]
soroban-sdk = { workspace = true }`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 3: Add to Workspace</h2>
          <p>Update the root <code>Cargo.toml</code> to include your new game:</p>
          <div className="code-block">
            <pre>
              <code>{`[workspace]
resolver = "2"
members = [
  "contracts/mock-ohloss",
  "contracts/twenty-one",
  "contracts/number-guess",
  "contracts/my-game",  # Add this line
]`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 4: Implement Required Functions</h2>
          <p>Your game contract must start_game and end_game in the OHLOSS (mock) contract</p>

          <h3>Interface</h3>
          <div className="code-block">
            <pre>
              <code>{`#[contractclient(name = "OhlossClient")]
pub trait Ohloss {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_wager: i128,
        player2_wager: i128,
    );

    fn end_game(
        env: Env,
        session_id: u32,
        player1_won: bool
    );
}`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 5: Test Your Contract</h2>
          <div className="code-block">
            <pre>
              <code>{`cd contracts/my-game
cargo test`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 6: Build, Deploy, and Generate Bindings (Automatic)</h2>
          <p>Once your contract is listed under <code>[workspace].members</code>, the scripts will automatically build/deploy it and generate bindings and <code>.env</code> entries based on the crate name:</p>
          <div className="code-block">
            <pre>
              <code>{`bun run setup`}</code>
            </pre>
          </div>
          <p>
            Example: a crate named <code>my-game</code> generates <code>bindings/my_game/</code> and writes
            <code>VITE_MY_GAME_CONTRACT_ID</code> to the root <code>.env</code>.
          </p>
        </section>

        <section className="content-block">
          <h2>Best Practices</h2>
          <ul>
            <li>Always call <code>player.require_auth()</code> for player actions</li>
            <li>Validate all inputs before processing</li>
            <li>Use temporary storage with proper TTL for game sessions</li>
            <li>Keep contract logic simple and focused</li>
            <li>Write comprehensive tests for all game flows</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function ImportGameSection() {
  return (
    <div className="doc-section">
      <h1 className="doc-title">Import a Game</h1>
      <p className="doc-subtitle">
        Integrate existing OHLOSS games into your Game Studio instance
      </p>

      <div className="doc-content">
        <section className="content-block">
          <h2>Overview</h2>
          <p>
            Importing a game allows you to integrate existing OHLOSS-compatible games into your
            Game Studio instance. This guide shows you exactly which files to modify and what code to add.
          </p>

          <div className="info-box">
            <div className="info-icon">💡</div>
            <div>
              <strong>Quick Reference: Number Guess Example</strong>
              <p>The number-guess game in this repo was imported from OHLOSS following this exact pattern. You can refer to it as a working example:</p>
              <ul>
                <li><code>contracts/number-guess/</code> - Contract files</li>
                <li><code>frontend/src/games/number-guess/</code> - Frontend component and service</li>
                <li>With the current scripts, no script edits are required to add additional contracts</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="content-block">
          <h2>Files You'll Modify</h2>
          <p>To import a game, you’ll add it to the workspace and wire it into the frontend. No changes are required in <code>scripts/build.ts</code>, <code>scripts/deploy.ts</code>, <code>scripts/bindings.ts</code>, or <code>scripts/setup.ts</code>.</p>
          <ul>
            <li><code>Cargo.toml</code> (root) - Add to workspace</li>
            <li><code>contracts/&lt;imported-game&gt;/</code> - Add contract source</li>
            <li><code>frontend/src/games/&lt;imported-game&gt;/</code> - Add game UI + service</li>
            <li><code>frontend/src/components/GamesCatalog.tsx</code> - Add import, routing, and card</li>
          </ul>
        </section>

        <section className="content-block">
          <h2>Prerequisites</h2>
          <p>Before importing a game, ensure you have:</p>
          <ul>
            <li>The game's contract source code (Rust + Soroban)</li>
            <li>The game's frontend component (React + TypeScript)</li>
            <li>Confirmation that the game implements OHLOSS integration</li>
          </ul>
        </section>

        <section className="content-block">
          <h2>Step 1: Add Contract Files</h2>
          <p>Copy the game's contract directory to your contracts folder:</p>
          <div className="code-block">
            <pre>
              <code>{`# Copy contract directory
cp -r /path/to/game-contract contracts/imported-game

# Verify the structure
ls contracts/imported-game
# Should contain: src/, Cargo.toml, and optionally test/`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 2: Add to Cargo Workspace</h2>
          <p>Edit the root <code>Cargo.toml</code> to include the imported game:</p>
          <div className="code-block">
            <pre>
              <code>{`[workspace]
resolver = "2"
members = [
  "contracts/mock-ohloss",
  "contracts/twenty-one",
  "contracts/number-guess",
  "contracts/imported-game",  # Add this
]`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 3: Build, Deploy, and Generate Bindings (Automatic)</h2>
          <p>Once the contract is listed in the workspace members, the scripts automatically:</p>
          <ul>
            <li>Build all contracts</li>
            <li>Deploy all contracts (deploying <code>mock-ohloss</code> first)</li>
            <li>Generate TypeScript bindings for every deployed contract</li>
            <li>Write per-contract IDs into the root <code>.env</code> using the crate name</li>
          </ul>
          <div className="code-block">
            <pre>
              <code>{`bun run setup`}</code>
            </pre>
          </div>
          <p>
            Example: a crate named <code>imported-game</code> generates <code>bindings/imported_game/</code> and writes
            <code>VITE_IMPORTED_GAME_CONTRACT_ID</code> to the root <code>.env</code>.
          </p>
        </section>

        <section className="content-block">
          <h2>Step 4: Use the Contract ID (No Manual Config)</h2>
          <p>
            After <code>bun run setup</code>, every workspace contract gets a <code>VITE_..._CONTRACT_ID</code> entry in the root <code>.env</code>
            derived from the crate name (for example <code>imported-game</code> → <code>VITE_IMPORTED_GAME_CONTRACT_ID</code>).
          </p>
          <p>
            In your frontend code, either read it directly from <code>import.meta.env</code> or use the helper:
            <code>getContractId('imported-game')</code>.
          </p>
          <div className="code-block">
            <pre>
              <code>{`import { getContractId } from '@/utils/constants';

const IMPORTED_GAME_CONTRACT_ID = getContractId('imported-game');`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 5: Add Frontend Component</h2>
          <p>Copy the game's frontend directory to <code>frontend/src/games/imported-game/</code>:</p>
          <div className="code-block">
            <pre>
              <code>{`# Copy the game component and service
cp -r /path/to/game/frontend/src/games/imported-game frontend/src/games/

# Verify structure
ls frontend/src/games/imported-game/
# Should contain: ImportedGame.tsx, importedGameService.ts, and optionally .css files`}</code>
            </pre>
          </div>

          <div className="info-box">
            <div className="info-icon">💡</div>
            <div>
              <strong>Service Pattern for Easy Import/Export</strong>
              <p>When copying from OHLOSS, the game service should accept a <code>contractId</code> parameter:</p>
            </div>
          </div>

          <div className="code-block">
            <pre>
              <code>{`// importedGameService.ts
import { Client as ImportedGameClient } from 'imported-game';
import { NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';

export class ImportedGameService {
  private contractId: string;
  private baseClient: ImportedGameClient;

  constructor(contractId: string) {
    this.contractId = contractId;
    this.baseClient = new ImportedGameClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }

  // All methods use this.contractId instead of a constant
}`}</code>
            </pre>
          </div>

          <div className="code-block">
            <pre>
              <code>{`// ImportedGame.tsx
import { ImportedGameService } from './importedGameService';
import { getContractId } from '@/utils/constants';

// Create service instance with contract ID
const importedGameService = new ImportedGameService(getContractId('imported-game'));

export function ImportedGame({ userAddress, onBack, ... }) {
  // Use importedGameService in your component
}`}</code>
            </pre>
          </div>

          <p>This pattern makes it easy to move games between OHLOSS and Game Studio by just changing the import path and passing the contract ID.</p>
        </section>

        <section className="content-block">
          <h2>Step 6: Add to Games Catalog</h2>
          <p>Update <code>frontend/src/components/GamesCatalog.tsx</code> in 3 places:</p>

          <h3>6a. Add Import</h3>
          <div className="code-block">
            <pre>
              <code>{`import { useState } from 'react';
import { TwentyOneGame } from '../games/twenty-one/TwentyOneGame';
import { NumberGuessGame } from '../games/number-guess/NumberGuessGame';
import { ImportedGame } from '../games/imported-game/ImportedGame';  // Add this
import './GamesCatalog.css';`}</code>
            </pre>
          </div>

          <h3>6b. Add Routing</h3>
          <p>After the existing game conditionals, add:</p>
          <div className="code-block">
            <pre>
              <code>{`if (selectedGame === 'imported-game') {
  return (
    <ImportedGame
      userAddress="mock-user-address"
      currentEpoch={1}
      availableFP={1000000000n}
      onBack={handleBackToGames}
      onStandingsRefresh={() => console.log('Refresh standings')}
      onGameComplete={() => console.log('Game complete')}
    />
  );
}`}</code>
            </pre>
          </div>

          <h3>6c. Add Game Card</h3>
          <p>Add a new card in the games grid:</p>
          <div className="code-block">
            <pre>
              <code>{`{/* Imported Game Card */}
<div
  className="game-card-wrapper"
  onClick={() => handleSelectGame('imported-game')}
>
  <div className="game-card">
    <div className="game-card-gradient"></div>

    <div className="game-card-content">
      <div className="game-emoji">🎯</div>
      <h3 className="game-title">
        IMPORTED GAME
      </h3>
      <p className="game-description">
        Description of your imported game
      </p>

      <div className="game-details">
        <div className="game-detail-item">
          <span className="detail-label">Players:</span>
          <span className="detail-value">2</span>
        </div>
        <div className="game-detail-item">
          <span className="detail-label">Type:</span>
          <span className="detail-value">Game Type</span>
        </div>
      </div>

      <div className="game-card-footer">
        <div className="play-button">
          Play Now
        </div>
      </div>
    </div>
  </div>
</div>`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 7: Deploy and Test</h2>
          <div className="code-block">
            <pre>
              <code>{`# Run the full setup
bun run setup

# Or run steps individually
bun run build
bun run deploy
bun run bindings
cd frontend && bun run dev`}</code>
            </pre>
          </div>
        </section>

      </div>
    </div>
  );
}

function ExportGameSection() {
  return (
    <div className="doc-section">
      <h1 className="doc-title">Publish a Game</h1>
      <p className="doc-subtitle">
        Deploy to mainnet and host your game yourself
      </p>

      <div className="doc-content">
        <section className="content-block">
          <h2>Overview</h2>
          <p>
            OHLOSS does not host third-party games. To publish a game, you deploy your contract to
            mainnet and host a standalone frontend on your own infrastructure (Vercel, Surge,
            Cloudflare Pages, etc.). You should also publish your code in your own GitHub repository.
          </p>
        </section>

        <section className="content-block">
          <h2>Step 1: Prepare Your New Game</h2>
          <p>Before exporting, ensure your game is complete and tested:</p>
          <ul>
            <li>All contract functions work correctly</li>
            <li>Tests pass with <code>cargo test</code></li>
            <li>Frontend component is fully functional</li>
            <li>OHLOSS integration is properly implemented</li>
            <li>Code is well-documented</li>
          </ul>
        </section>

        <section className="content-block">
          <h2>Step 2: Deploy Your Contract to Mainnet</h2>
          <p>Deploy your game contract and point it at the mainnet OHLOSS contract.</p>
          <div className="code-block">
            <pre>
              <code>{`# Build optimized WASM
bun run build

# Install WASM on mainnet
stellar contract install --wasm target/wasm32v1-none/release/my_game.wasm --source <ADMIN> --network mainnet

# Deploy + initialize with OHLOSS mainnet contract ID
stellar contract deploy --wasm-hash <WASM_HASH> --source <ADMIN> --network mainnet -- \\
  --admin <ADMIN_ADDRESS> --ohloss <OHLOSS_MAINNET_CONTRACT_ID>`}</code>
            </pre>
          </div>
          <div className="info-box">
            <div className="info-icon">✅</div>
            <div>
              <strong>Use the correct OHLOSS mainnet contract ID</strong>
              <ul>
                <li>See <code>CHITSHEET.md</code> for the current mainnet OHLOSS address</li>
                <li>Keep the game contract ID handy for frontend configuration</li>
                <li>Mainnet requires a funded admin keypair</li>
              </ul>
            </div>
          </div>

          <h3>Register Your Game (Whitelist)</h3>
          <p>
            The mainnet OHLOSS contract only accepts outcomes from approved games. The OHLOSS admin
            must call <code>add_game</code> with your game contract ID and developer address. Share
            these details with the maintainer to get whitelisted.
          </p>
          <div className="code-block">
            <pre>
              <code>{`# (Admin-only) Register your game on mainnet OHLOSS
stellar contract invoke --id <OHLOSS_MAINNET_CONTRACT_ID> --source <OHLOSS_ADMIN> --network mainnet -- \\
  add_game --game_id <YOUR_GAME_CONTRACT_ID> --developer <YOUR_DEVELOPER_ADDRESS>`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 3: Publish a Standalone Frontend</h2>
          <p>
            Generate a production-ready frontend that renders only your game.
            The publish script rewrites <code>App.tsx</code>, swaps in a standalone layout,
            and uses Stellar Wallets Kit v2 for real wallet connections.
          </p>
          <div className="code-block">
            <pre>
              <code>{`# From game-studio/
bun run publish my-game

# Optional: choose a custom output directory
bun run publish my-game --out ../my-game-frontend`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 4: Configure Mainnet Runtime Settings</h2>
          <p>
            Open <code>public/ohloss-config.js</code> in your standalone frontend and set the
            mainnet RPC URL, network passphrase, and your new contract ID.
          </p>
          <div className="code-block">
            <pre>
              <code>{`window.__OHLOSS_CONFIG__ = {
  rpcUrl: "https://soroban-mainnet.stellar.org",
  networkPassphrase: "Public Global Stellar Network ; September 2015",
  contractIds: {
    "my-game": "<YOUR_MAINNET_CONTRACT_ID>"
  },
  simulationSourceAddress: "<OPTIONAL_FUNDED_ADDRESS>"
};`}</code>
            </pre>
          </div>
          <p>
            This file is loaded at runtime, so you can update contract IDs without rebuilding the
            frontend.
          </p>
        </section>

        <section className="content-block">
          <h2>Step 5: Work With the Standalone Frontend</h2>
          <div className="code-block">
            <pre>
              <code>{`cd ../my-game
bun install

# Local dev
bun run dev

# Production build
bun run build`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 6: Deploy the Frontend</h2>
          <p>Build the site and deploy to any static host.</p>
          <div className="code-block">
            <pre>
              <code>{`bun install
bun run build

# Vercel
vercel --prod

# Surge
npx surge dist

# Cloudflare Pages
wrangler pages deploy dist`}</code>
            </pre>
          </div>
        </section>

        <section className="content-block">
          <h2>Step 7: Community Guidelines</h2>
          <p>When sharing your game, follow these best practices:</p>
          <ul>
            <li>Provide clear instructions with game rules</li>
            <li>Include unit tests for contract</li>
            <li>Include any security considerations or requirements</li>
            <li>Publish the code in your own GitHub repo</li>
          </ul>
        </section>

        <section className="content-block">
          <h2>Export Checklist</h2>
          <ul>
            <li>✅ Game builds without errors</li>
            <li>✅ All tests pass</li>
            <li>✅ Mainnet contract deployed</li>
            <li>✅ Frontend is standalone and configured for mainnet</li>
            <li>✅ Hosted on your chosen platform</li>
            <li>✅ Code published in your own GitHub repo</li>
          </ul>
        </section>

        <section className="content-block">
          <h2>Maintenance and Updates</h2>
          <p>After exporting, maintain your game:</p>
          <ul>
            <li>Use semantic versioning (MAJOR.MINOR.PATCH)</li>
            <li>Document breaking changes in release notes</li>
            <li>Keep dependencies up to date</li>
            <li>Respond to community issues and contributions in your repo</li>
            <li>Test compatibility with new Soroban SDK versions</li>
          </ul>
        </section>

        <section className="content-block">
          <h2>Mainnet Availability</h2>
          <p>
            For mainnet gameplay, your game contract must be registered on the mainnet OHLOSS contract
            by the admin. If you are not the admin, share your contract ID and developer address to
            request approval.
          </p>
        </section>
      </div>
    </div>
  );
}
