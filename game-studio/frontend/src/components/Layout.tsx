import { useState } from 'react';
import { WalletSwitcher } from './WalletSwitcher';
import { DocumentationContent, type DocSection } from '../pages/Resources';
import { ExternalLink, Github } from 'lucide-react';
import { AsciiBackground } from './AsciiBackground';
import './Layout.css';
import '../pages/Resources.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [activeSection, setActiveSection] = useState<'games' | DocSection>('games');

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="layout">
      <AsciiBackground />
      {/* Header */}
      <header className="layout-header">
        <div className="header-content">
          <div className="header-left">
            <div className="header-brand">
              <h1 className="header-title">
                <span className="sr-only">OHLOSS Game Studio</span>
                <span className="header-ascii gradient-text" aria-hidden="true">{`  ██████╗ ██╗  ██╗██╗      ██████╗ ███████╗███████╗
 ██╔═══██╗██║  ██║██║     ██╔═══██╗██╔════╝██╔════╝
 ██║   ██║███████║██║     ██║   ██║███████╗███████╗
 ██║   ██║██╔══██║██║     ██║   ██║╚════██║╚════██║
 ╚██████╔╝██║  ██║███████╗╚██████╔╝███████║███████║
  ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝╚══════╝`}</span>
                <span className="header-title-text">GAME STUDIO</span>
              </h1>
              <p className="header-subtitle">Build Zero-Loss Games On Stellar</p>
            </div>
          </div>
          <div className="header-right">
            <WalletSwitcher />
          </div>
        </div>
      </header>

      <div className="layout-body resources-page">
        {/* Sidebar Navigation */}
        <aside className="resources-sidebar">
          <div className="sidebar-content">
            <h3 className="sidebar-title">Library</h3>
            <nav className="sidebar-nav">
              <button
                className={`nav-item ${activeSection === 'games' ? 'active' : ''}`}
                onClick={() => setActiveSection('games')}
              >
                <span className="nav-icon">🎮</span>
                Games Library
              </button>
            </nav>

            <div className="sidebar-divider"></div>

            <h3 className="sidebar-title">Documentation</h3>
            <nav className="sidebar-nav">
              <button
                className={`nav-item ${activeSection === 'quickstart' ? 'active' : ''}`}
                onClick={() => setActiveSection('quickstart')}
              >
                <span className="nav-icon">🚀</span>
                Quickstart
              </button>

              <button
                className={`nav-item ${activeSection === 'create' ? 'active' : ''}`}
                onClick={() => setActiveSection('create')}
              >
                <span className="nav-icon">✨</span>
                Create a New Game
              </button>

              <button
                className={`nav-item ${activeSection === 'import' ? 'active' : ''}`}
                onClick={() => setActiveSection('import')}
              >
                <span className="nav-icon">📥</span>
                Import a Game
              </button>

              <button
                className={`nav-item ${activeSection === 'export' ? 'active' : ''}`}
                onClick={() => setActiveSection('export')}
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
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="resources-content">
          {activeSection === 'games' ? children : <DocumentationContent section={activeSection} />}
        </main>
      </div>
    </div>
  );
}
