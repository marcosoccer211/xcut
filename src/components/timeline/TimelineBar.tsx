import { useRef, useState } from 'react'
import { Scissors, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import type { VideoClip } from '@/types'

interface TimelineBarProps {
  duration: number
  currentTime: number
  onSeek: (time: number) => void
  onGapClick?: (time: number) => void
}

export function TimelineBar({ duration, currentTime, onSeek, onGapClick }: TimelineBarProps) {
  const { clips, splitClip, deleteClip, trimClip } = useProjectStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ clipId: string; side: 'left' | 'right' } | null>(null)

  if (!duration || clips.length === 0) return null

  const pxToTime = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }

  const timeToPct = (t: number) => `${(t / duration) * 100}%`

  // ── track background click → seek ──
  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return
    setSelectedId(null)
    const t = pxToTime(e.clientX)
    // If click lands in a gap, jump to the next clip's start instead
    const inClip = clips.some(c => t >= c.start && t < c.end)
    if (!inClip) {
      const next = clips.find(c => c.start > t)
      if (next) {
        if (onGapClick) onGapClick(next.start)
        else onSeek(next.start)
        return
      }
    }
    onSeek(t)
  }

  // ── clip body click → select ──
  const handleClipPointerDown = (e: React.PointerEvent, clip: VideoClip) => {
    e.stopPropagation()
    setSelectedId(clip.id)
    onSeek(pxToTime(e.clientX))
  }

  // ── handle drag ──
  const handleHandlePointerDown = (
    e: React.PointerEvent,
    clipId: string,
    side: 'left' | 'right',
  ) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { clipId, side }
  }

  const handleHandlePointerMove = (e: React.PointerEvent, clip: VideoClip) => {
    if (e.buttons !== 1 || !dragRef.current || dragRef.current.clipId !== clip.id) return
    const time = pxToTime(e.clientX)
    if (dragRef.current.side === 'left') {
      trimClip(clip.id, time, clip.end)
    } else {
      trimClip(clip.id, clip.start, time)
    }
  }

  const handleHandlePointerUp = () => { dragRef.current = null }

  const canDelete = clips.length > 1 && selectedId !== null

  const handleSplit = () => {
    splitClip(currentTime)
    setSelectedId(null)
  }

  const handleDelete = () => {
    if (!canDelete || !selectedId) return
    deleteClip(selectedId)
    setSelectedId(null)
  }

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  // Total duration across all clips
  const totalClipDuration = clips.reduce((sum, c) => sum + (c.end - c.start), 0)

  return (
    <div className="shrink-0 space-y-1.5">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSplit}
            title="在当前位置分割"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-white/60 hover:text-white/90 hover:bg-white/8 border border-transparent hover:border-white/10 transition-all"
          >
            <Scissors className="w-3 h-3" />
            分割
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            title="删除选中片段"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all border border-transparent disabled:opacity-30 disabled:cursor-not-allowed text-red-400/70 hover:text-red-300 hover:bg-red-500/8 hover:border-red-500/15 enabled:cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            删除
          </button>
        </div>
        <span className="text-[10px] text-white/25 font-mono tabular-nums">
          {fmtTime(totalClipDuration)} 有效时长
        </span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        className="relative h-9 rounded-lg bg-white/5 border border-white/8 cursor-pointer overflow-hidden select-none"
      >
        {/* Gaps (deleted segments) — show as subtle darker overlay */}
        {clips.map((clip, i) => {
          const prevEnd = i === 0 ? 0 : clips[i - 1].end
          if (clip.start <= prevEnd) return null
          return (
            <div
              key={`gap-${i}`}
              className="absolute top-0 h-full bg-black/30"
              style={{ left: timeToPct(prevEnd), width: timeToPct(clip.start - prevEnd) }}
            />
          )
        })}
        {/* Gap after last clip */}
        {clips.length > 0 && clips[clips.length - 1].end < duration && (
          <div
            className="absolute top-0 h-full bg-black/30"
            style={{
              left: timeToPct(clips[clips.length - 1].end),
              width: timeToPct(duration - clips[clips.length - 1].end),
            }}
          />
        )}

        {/* Clip blocks */}
        {clips.map((clip) => {
          const isSelected = clip.id === selectedId
          return (
            <div
              key={clip.id}
              className={`absolute top-0 h-full border transition-colors ${
                isSelected
                  ? 'bg-blue-500/35 border-blue-400/60'
                  : 'bg-blue-500/20 border-blue-400/30 hover:bg-blue-500/28'
              }`}
              style={{ left: timeToPct(clip.start), width: timeToPct(clip.end - clip.start) }}
              onPointerDown={(e) => handleClipPointerDown(e, clip)}
            >
              {/* Left trim handle */}
              <div
                className="absolute left-0 top-0 h-full w-2 cursor-ew-resize flex items-center justify-center hover:bg-blue-400/30 transition-colors"
                onPointerDown={(e) => handleHandlePointerDown(e, clip.id, 'left')}
                onPointerMove={(e) => handleHandlePointerMove(e, clip)}
                onPointerUp={handleHandlePointerUp}
              >
                <div className="w-px h-4 bg-blue-300/60 rounded-full" />
              </div>
              {/* Right trim handle */}
              <div
                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize flex items-center justify-center hover:bg-blue-400/30 transition-colors"
                onPointerDown={(e) => handleHandlePointerDown(e, clip.id, 'right')}
                onPointerMove={(e) => handleHandlePointerMove(e, clip)}
                onPointerUp={handleHandlePointerUp}
              >
                <div className="w-px h-4 bg-blue-300/60 rounded-full" />
              </div>
            </div>
          )
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)] pointer-events-none z-10"
          style={{ left: timeToPct(currentTime) }}
        >
          {/* Playhead top knob */}
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
        </div>
      </div>
    </div>
  )
}
