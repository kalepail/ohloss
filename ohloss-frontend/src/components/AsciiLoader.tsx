import { useEffect, useState } from 'react'

const SPINNER_FRAMES = ['/', '-', '\\', '|']

interface AsciiLoaderProps {
  text?: string
  className?: string
}

export function AsciiLoader({ text = 'LOADING', className = '' }: AsciiLoaderProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className={className}>
      <span className="font-mono">{SPINNER_FRAMES[spinnerFrame]}</span>
      {' '}{text}{dots.padEnd(3, '\u00A0')}{' '}
      <span className="font-mono">{SPINNER_FRAMES[spinnerFrame]}</span>
    </span>
  )
}
