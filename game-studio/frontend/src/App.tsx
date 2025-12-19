import { config } from './config';
import { Layout } from './components/Layout';
import { GamesCatalog } from './components/GamesCatalog';

function App() {
  const hasAnyContracts = Object.keys(config.contractIds).length > 0;

  return (
    <Layout>
      {!hasAnyContracts ? (
        <div className="card">
          <h3 className="gradient-text">Setup Required</h3>
          <p style={{ color: '#4b5563', marginTop: '1rem' }}>
            Contract IDs not configured. Please run <code>bun run setup</code> from the repo root
            to deploy contracts and configure the frontend.
          </p>
        </div>
      ) : (
        <GamesCatalog />
      )}
    </Layout>
  );
}

export default App;
