import { useRef } from 'react'
import { cn } from '@/lib/utils'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (v: number) => string
  className?: string
}

export function Slider({ label, value, min, max, step = 1, onChange, formatValue, className }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = ((value - min) / (max - min)) * 100

  const calcValue = (clientX: number): number => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    const raw = (clientX - rect.left) / rect.width
    const clamped = Math.max(0, Math.min(1, raw))
    const rawValue = clamped * (max - min) + min
    const stepped = Math.round(rawValue / step) * step
    return Math.max(min, Math.min(max, stepped))
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(calcValue(e.clientX))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    onChange(calcValue(e.clientX))
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="text-white/90 font-medium tabular-nums">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="relative h-5 flex items-center cursor-pointer select-none"
      >
        {/* Track background */}
        <div className="w-full h-1.5 rounded-full bg-white/10">
          {/* Fill */}
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className="absolute w-4 h-4 rounded-full bg-white shadow-[0_0_8px_rgba(120,150,255,0.8)] border-2 border-blue-300/60 pointer-events-none transition-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
    </div>
  )
}
