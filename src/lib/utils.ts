import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function getAspectRatioDimensions(ratio: string): { w: number; h: number } {
  const map: Record<string, { w: number; h: number }> = {
    '16:9': { w: 16, h: 9 },
    '9:16': { w: 9, h: 16 },
    '1:1': { w: 1, h: 1 },
    '4:3': { w: 4, h: 3 },
    '21:9': { w: 21, h: 9 },
  }
  return map[ratio] || { w: 16, h: 9 }
}

export function secondsToSRT(seconds: number): string {
  return formatTime(seconds).replace(',', ',')
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}
