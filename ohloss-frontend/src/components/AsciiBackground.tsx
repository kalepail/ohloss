import { useEffect, useRef, useState } from 'react'

const ASCII_CHARS = ' .:-=+*#%@'

export function AsciiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const charWidth = 10
  const charHeight = 16

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dimensions.width === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = dimensions.width
    canvas.height = dimensions.height

    const cols = Math.ceil(dimensions.width / charWidth)
    const rows = Math.ceil(dimensions.height / charHeight)

    let animationId: number

    const render = () => {
      frameRef.current++
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, dimensions.width, dimensions.height)

      ctx.font = `${charHeight}px "IBM Plex Mono", monospace`
      ctx.textBaseline = 'top'

      const time = frameRef.current * 0.015

      // Render ASCII grid with wave patterns
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * charWidth
          const y = row * charHeight

          // Multiple overlapping wave patterns
          const wave1 = Math.sin(col * 0.08 + time) * 0.5
          const wave2 = Math.cos(row * 0.06 + time * 0.8) * 0.5
          const wave3 = Math.sin((col + row) * 0.04 + time * 0.5) * 0.4
          const wave4 = Math.cos((col - row) * 0.03 + time * 0.3) * 0.3

          let intensity = (wave1 + wave2 + wave3 + wave4 + 2) / 4

          // Clamp and get character
          intensity = Math.max(0, Math.min(1, intensity))
          const charIndex = Math.floor(intensity * (ASCII_CHARS.length - 1))
          const char = ASCII_CHARS[charIndex]

          // Subtle alpha variation
          const alpha = 0.08 + intensity * 0.25

          ctx.fillStyle = `rgba(224, 224, 224, ${alpha})`
          ctx.fillText(char, x, y)
        }
      }

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [dimensions])

  return (
    <div ref={containerRef} className="fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />
      {/* Vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.5) 100%)',
          zIndex: 1,
        }}
      />
      {/* Scanline overlay */}
      <div className="scanline-overlay" style={{ zIndex: 2 }} />
    </div>
  )
}
