import { useEffect, useRef, useState, useCallback } from 'react'
import { Upload, Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { getAspectRatioDimensions } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { drawVideoFrame } from '@/lib/drawFrame'
import { TimelineBar } from '@/components/timeline/TimelineBar'

export function VideoPreview() {
  const { videoUrl, subtitle, title, background, setVideo, clips, initClips } = useProjectStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // Stable refs for use inside rAF loop (avoids stale closures)
  const clipsRef = useRef(clips)
  useEffect(() => { clipsRef.current = clips }, [clips])

  // Prevents re-entrant gap-jump seeks while one is already in flight
  const gapSeekingRef = useRef(false)

  const handleFileUpload = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) return
    const url = URL.createObjectURL(file)
    setVideo(file, url)
  }, [setVideo])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  const drawFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')!
    drawVideoFrame(ctx, video, subtitle, title, background)
  }, [subtitle, title, background])

  const loop = useCallback(() => {
    drawFrame()

    // Multi-clip boundary check: jump over gaps, stop at last clip's end
    const v = videoRef.current
    if (v && !v.paused && !gapSeekingRef.current) {
      const cls = clipsRef.current
      if (cls.length > 0) {
        const t = v.currentTime
        const inClip = cls.some(c => t >= c.start && t < c.end)
        if (!inClip) {
          const next = cls.find(c => c.start > t)
          if (next) {
            // Flag prevents re-entrant seeks while this one is in flight
            gapSeekingRef.current = true
            v.addEventListener('seeked', () => {
              gapSeekingRef.current = false
              if (v.paused) v.play().catch(() => {
                setIsPlaying(false)
              })
            }, { once: true })
            v.currentTime = next.start
          } else {
            v.pause()
            setIsPlaying(false)
          }
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(loop)
  }, [drawFrame])

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(loop)
    } else {
      cancelAnimationFrame(animFrameRef.current)
      drawFrame()
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isPlaying, loop, drawFrame])

  // Redraw when settings change (even while paused)
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current)
    drawFrame()
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(loop)
    }
  }, [subtitle, title, background]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onMeta = () => {
      setDuration(video.duration)
      initClips(video.duration)
    }
    const onTimeUpdate = () => {
      const t = video.currentTime
      setCurrentTime(t)
      // Backup boundary check: catches cases where the rAF loop misses the gap
      if (!video.paused && !gapSeekingRef.current) {
        const cls = clipsRef.current
        if (cls.length > 0) {
          const inClip = cls.some(c => t >= c.start && t < c.end)
          if (!inClip) {
            const next = cls.find(c => c.start > t)
            if (next) {
              gapSeekingRef.current = true
              video.addEventListener('seeked', () => {
                gapSeekingRef.current = false
                if (video.paused) video.play().catch(() => {
                  setIsPlaying(false)
                })
              }, { once: true })
              video.currentTime = next.start
            } else {
              video.pause()
              setIsPlaying(false)
            }
          }
        }
      }
    }
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [videoUrl, initClips])

  // Redraw canvas after seek completes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onSeeked = () => drawFrame()
    video.addEventListener('seeked', onSeeked)
    return () => video.removeEventListener('seeked', onSeeked)
  }, [drawFrame])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (isPlaying) {
      v.pause()
      setIsPlaying(false)
      return
    }

    // Determine target time
    let target = v.currentTime
    const cls = clipsRef.current
    if (cls.length > 0) {
      const lastClip = cls[cls.length - 1]
      if (target >= lastClip.end) {
        target = cls[0].start
      } else {
        const inClip = cls.some(c => target >= c.start && target < c.end)
        if (!inClip) {
          const next = cls.find(c => c.start > target)
          target = next ? next.start : cls[0].start
        }
      }
    }

    const doPlay = () => {
      setIsPlaying(true)
      v.play().catch(() => setIsPlaying(false))
    }
    if (Math.abs(v.currentTime - target) > 0.01) {
      v.addEventListener('seeked', doPlay, { once: true })
      v.currentTime = target
    } else {
      doPlay()
    }
  }

  const seek = (seconds: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + seconds))
  }

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(duration, time))
    setCurrentTime(v.currentTime)
  }, [duration])

  // Gap click: jump to next clip start and PAUSE (user presses play manually)
  const seekToNextClip = useCallback((time: number) => {
    const v = videoRef.current
    if (!v) return
    const target = Math.max(0, Math.min(duration, time))
    // Stop playback if currently playing
    if (!v.paused) v.pause()
    gapSeekingRef.current = true
    setIsPlaying(false)
    setCurrentTime(target)
    if (Math.abs(v.currentTime - target) > 0.01) {
      v.addEventListener('seeked', () => {
        gapSeekingRef.current = false
      }, { once: true })
      v.currentTime = target
    } else {
      gapSeekingRef.current = false
    }
  }, [duration])

  const progressRef = useRef<HTMLDivElement>(null)

  const calcSeekPct = (clientX: number): number => {
    const track = progressRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    return (clientX - rect.left) / rect.width
  }

  const handleProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    seekTo(calcSeekPct(e.clientX) * duration)
  }

  const handleProgressPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    seekTo(calcSeekPct(e.clientX) * duration)
  }

  const { w, h } = getAspectRatioDimensions(background.aspectRatio)
  const canvasH = Math.round(1280 / (w / h))

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center bg-black/30 rounded-2xl overflow-hidden min-h-0 border border-white/5">
        {!videoUrl ? (
          <label
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-4 w-full h-full cursor-pointer transition-all duration-200',
              isDragging ? 'bg-blue-500/10' : 'hover:bg-white/2'
            )}
          >
            <div className={cn(
              'w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center transition-all',
              isDragging ? 'border-blue-400/60 text-blue-400' : 'border-white/15 text-white/25'
            )}>
              <Upload className="w-7 h-7" />
            </div>
            <div className="text-center">
              <p className="text-sm text-white/40">拖放视频文件</p>
              <p className="text-xs text-white/20 mt-1">或点击选择文件 · MP4 / MOV / WebM</p>
            </div>
            <input type="file" accept="video/*" onChange={handleFileInput} className="hidden" />
          </label>
        ) : (
          <canvas
            ref={canvasRef}
            width={1280}
            height={canvasH}
            className="max-w-full max-h-full object-contain rounded-xl"
          />
        )}
      </div>

      <video
        ref={videoRef}
        src={videoUrl || undefined}
        className="hidden"
        onEnded={() => setIsPlaying(false)}
        playsInline
      />

      {/* Controls */}
      {videoUrl && (
        <div className="space-y-2 shrink-0">
          {/* Progress bar */}
          <div
            ref={progressRef}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            className="relative h-5 flex items-center cursor-pointer select-none group"
          >
            <div className="w-full h-1.5 rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_6px_rgba(120,150,255,0.8)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${duration ? (currentTime / duration) * 100 : 0}% - 6px)` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => seek(-5)}
                className="text-white/40 hover:text-white/70 transition-colors"
                title="后退5秒"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/18 transition-all"
              >
                {isPlaying
                  ? <Pause className="w-3.5 h-3.5 text-white" />
                  : <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                }
              </button>
              <button
                onClick={() => seek(5)}
                className="text-white/40 hover:text-white/70 transition-colors"
                title="前进5秒"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs text-white/35 font-mono tabular-nums">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
          </div>

          {/* Timeline editor */}
          <TimelineBar
            duration={duration}
            currentTime={currentTime}
            onSeek={seekTo}
            onGapClick={seekToNextClip}
          />
        </div>
      )}
    </div>
  )
}
