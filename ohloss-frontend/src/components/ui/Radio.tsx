import { ReactNode } from 'react'

interface RadioProps {
  checked: boolean
  onChange: () => void
  name: string
  label?: ReactNode
  className?: string
  labelClassName?: string
}

/**
 * Custom styled radio button that works consistently across browsers.
 * Matches the terminal aesthetic with visible borders.
 */
export function Radio({
  checked,
  onChange,
  name,
  label,
  className = '',
  labelClassName = '',
}: RadioProps) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer ${className}`}>
      <div
        onClick={onChange}
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          checked
            ? 'border-terminal-fg'
            : 'border-terminal-dim hover:border-terminal-fg/50'
        }`}
      >
        {checked && <div className="w-2 h-2 rounded-full bg-terminal-fg" />}
      </div>
      {/* Hidden native radio for form semantics/accessibility */}
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label && <span className={labelClassName}>{label}</span>}
    </label>
  )
}
