import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface SelectProps {
  label?: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}

export function Select({ label, value, options, onChange, className }: SelectProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label className="text-xs text-white/60">{label}</label>}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full appearance-none rounded-xl border border-white/15 bg-white/[0.08] backdrop-blur-sm',
            'px-3 py-2 text-sm text-white/90 pr-8',
            'focus:outline-none focus:border-blue-400/50 focus:bg-white/[0.12]',
            'transition-all duration-150'
          )}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#1a1a2e] text-white">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
      </div>
    </div>
  )
}
