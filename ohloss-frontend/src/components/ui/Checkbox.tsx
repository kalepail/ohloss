interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  className?: string
  labelClassName?: string
}

/**
 * Custom styled checkbox that works consistently across browsers.
 * Matches the terminal aesthetic with visible borders.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  className = '',
  labelClassName = '',
}: CheckboxProps) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer ${className}`}>
      <div
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 ${
          checked
            ? 'border-terminal-fg bg-terminal-fg'
            : 'border-terminal-dim bg-transparent hover:border-terminal-fg/50'
        }`}
      >
        {checked && <span className="text-terminal-bg text-xs font-bold leading-none">✓</span>}
      </div>
      {label && <span className={labelClassName}>{label}</span>}
    </label>
  )
}
