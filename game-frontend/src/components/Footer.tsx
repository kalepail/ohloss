export default function Footer() {
  const ohlossUrl = import.meta.env.VITE_OHLOSS_URL || 'https://ohloss.com'
  const githubUrl = 'https://github.com/kalepail/blendizzard/tree/main/game-frontend'

  return (
    <footer className="mt-auto py-4 border-t border-game-border">
      <div className="container mx-auto px-4 flex items-center justify-center gap-4 text-sm text-game-text/60">
        <a
          href={ohlossUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-game-primary transition-colors"
        >
          Ohloss
        </a>
        <span>|</span>
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-game-primary transition-colors"
        >
          GitHub
        </a>
      </div>
    </footer>
  )
}
