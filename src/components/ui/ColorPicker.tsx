import { cn } from '@/lib/utils'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function ColorPicker({ label, value, onChange, className }: ColorPickerProps) {
  // extract hex from rgba or use directly
  const hexValue = value.startsWith('#') ? value : '#ffffff'

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-xs text-white/60">{label}</span>
      <div className="relative flex items-center gap-2">
        <span className="text-xs text-white/50 font-mono">{value.startsWith('#') ? value : value.slice(0, 7)}</span>
        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/20">
          <div className="absolute inset-0" style={{ background: value }} />
          <input
            type="color"
            value={hexValue}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
      </div>
    </div>
  )
}
