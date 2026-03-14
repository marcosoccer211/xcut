import { useState, useRef, useEffect } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { Slider } from '@/components/ui/Slider'
import { useProjectStore } from '@/stores/projectStore'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'countdown' | 'recording' | 'paused' | 'processing'
type PipShape = 'circle' | 'rounded' | 'rect'
type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

function formatElapsed(s: number) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

const MIME_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

const CORNERS: { id: PipCorner; label: string }[] = [
  { id: 'top-left', label: '↖' },
  { id: 'top-right', label: '↗' },
  { id: 'bottom-left', label: '↙' },
  { id: 'bottom-right', label: '↘' },
]

const SHAPES: { id: PipShape; label: string; title: string }[] = [
  { id: 'circle',  label: '⬤', title: '圆形' },
  { id: 'rounded', label: '▣', title: '圆角矩形' },
  { id: 'rect',    label: '■', title: '矩形' },
]

// Preview canvas fixed dimensions (16:9)
const PV_W = 252
const PV_H = 142

interface RecordingPanelProps {
  onDone: () => void
}

export function RecordingPanel({ onDone }: RecordingPanelProps) {
  const { setVideo } = useProjectStore()

  const [phase, setPhase]           = useState<Phase>('idle')
  const [countdownSecs, setCountdownSecs] = useState(3)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraReady, setCameraReady]     = useState(false)
  const [countdown, setCountdown]   = useState(0)
  const [elapsed, setElapsed]       = useState(0)
  const [cameraError, setCameraError] = useState(false)

  const [pipSize, setPipSize]     = useState(25)
  const [pipShape, setPipShape]   = useState<PipShape>('rounded')
  const [pipCorner, setPipCorner] = useState<PipCorner>('bottom-right')
  const pipSizeRef   = useRef(25)
  const pipShapeRef  = useRef<PipShape>('rounded')
  const pipCornerRef = useRef<PipCorner>('bottom-right')

  const screenStreamRef    = useRef<MediaStream | null>(null)
  const cameraStreamRef    = useRef<MediaStream | null>(null)
  const cameraVideoRef     = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef     = useRef<HTMLVideoElement | null>(null)
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewCanvasRef   = useRef<HTMLCanvasElement | null>(null)
  const canvasTrackRef     = useRef<MediaStreamTrack | null>(null)
  const recorderRef        = useRef<MediaRecorder | null>(null)
  const chunksRef          = useRef<BlobPart[]>([])
  const loopTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedBaseRef     = useRef<number>(0)
  const phaseRef           = useRef<Phase>('idle')
  const mimeTypeRef        = useRef<string>('')
  const camWRef            = useRef<number>(0)
  const camHRef            = useRef<number>(0)
  const cameraOKRef        = useRef<boolean>(false)

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    return () => {
      stopPreviewLoop()
      if (loopTimerRef.current) clearInterval(loopTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      recorderRef.current?.stop()
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Sync state → ref (for real-time update inside setInterval)
  const updatePipSize = (v: number) => { setPipSize(v); pipSizeRef.current = v }
  const updatePipShape = (v: PipShape) => { setPipShape(v); pipShapeRef.current = v }
  const updatePipCorner = (v: PipCorner) => { setPipCorner(v); pipCornerRef.current = v }

  // ─── PiP drawing helper (shared by preview loop and recording loop) ───────
  function drawPip(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    videoEl: HTMLVideoElement,
  ) {
    const pct   = pipSizeRef.current / 100
    const pw    = cw * pct
    const camW  = camWRef.current
    const camH  = camHRef.current
    const shape = pipShapeRef.current
    const ph    = shape === 'circle' ? pw : (camW > 0 ? pw * (camH / camW) : pw * (9 / 16))
    const pad   = Math.round(cw * 0.012)
    const corner = pipCornerRef.current
    const px    = corner.includes('right')  ? cw - pw - pad : pad
    const py    = corner.includes('bottom') ? ch - ph - pad : pad

    ctx.save()
    ctx.beginPath()
    if (shape === 'circle') {
      ctx.arc(px + pw / 2, py + ph / 2, Math.min(pw, ph) / 2, 0, Math.PI * 2)
    } else if (shape === 'rounded') {
      const r = Math.min(pw, ph) * 0.12
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, r)
      else ctx.rect(px, py, pw, ph)
    } else {
      ctx.rect(px, py, pw, ph)
    }
    ctx.clip()
    ctx.drawImage(videoEl, px, py, pw, ph)
    ctx.restore()
  }

  // ─── Preview loop ─────────────────────────────────────────────────────────
  function drawPreview() {
    const canvas = previewCanvasRef.current
    const video  = cameraVideoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cw = canvas.width
    const ch = canvas.height

    // Simulated screen background
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, cw, ch)

    // Faint grid lines to look like a desktop screen
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < cw; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke() }
    for (let y = 0; y < ch; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke() }

    // Centered label
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.font = '11px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('屏幕内容', cw / 2, ch / 2)

    // Draw camera PiP
    drawPip(ctx, cw, ch, video)
  }

  function startPreviewLoop() {
    stopPreviewLoop()
    previewTimerRef.current = setInterval(drawPreview, 1000 / 30)
  }

  function stopPreviewLoop() {
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }

  // ─── Camera toggle (requests permission immediately for live preview) ─────
  const toggleCamera = async () => {
    if (cameraEnabled) {
      // Turn off
      stopPreviewLoop()
      cameraStreamRef.current?.getTracks().forEach(t => t.stop())
      cameraStreamRef.current = null
      cameraOKRef.current = false
      setCameraEnabled(false)
      setCameraReady(false)
      setCameraError(false)
      return
    }

    setCameraEnabled(true)
    setCameraError(false)
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      cameraStreamRef.current = camStream
      const s = camStream.getVideoTracks()[0]?.getSettings()
      camWRef.current = s?.width ?? 640
      camHRef.current = s?.height ?? 480
      cameraOKRef.current = true
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = camStream
        await cameraVideoRef.current.play()
      }
      setCameraReady(true)
      startPreviewLoop()
    } catch {
      setCameraEnabled(false)
      setCameraError(true)
    }
  }

  // ─── Recording composite loop ─────────────────────────────────────────────
  function startCompositeLoop() {
    const canvas = compositeCanvasRef.current
    const screenVideoEl = screenVideoRef.current
    if (!canvas || !screenVideoEl) return

    const drawAndPush = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(screenVideoEl, 0, 0, canvas.width, canvas.height)
      if (cameraOKRef.current && cameraVideoRef.current) {
        drawPip(ctx, canvas.width, canvas.height, cameraVideoRef.current)
      }
    }

    if (loopTimerRef.current) clearInterval(loopTimerRef.current)
    loopTimerRef.current = setInterval(drawAndPush, 1000 / 30)
  }

  function stopCompositeLoop() {
    if (loopTimerRef.current) { clearInterval(loopTimerRef.current); loopTimerRef.current = null }
  }

  // ─── Elapsed timer ────────────────────────────────────────────────────────
  function startElapsedTimer() {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    elapsedBaseRef.current = Date.now() - elapsed * 1000
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - elapsedBaseRef.current) / 1000))
    }, 500)
  }

  // ─── Recording stop callback ──────────────────────────────────────────────
  function handleRecordingStop() {
    const mimeType = mimeTypeRef.current
    const blob = new Blob(chunksRef.current, { type: mimeType })
    const url  = URL.createObjectURL(blob)
    const ext  = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([blob], `screen-recording.${ext}`, { type: mimeType })
    setVideo(file, url)
    setPhase('idle')
    setElapsed(0)
    // Restart preview if camera is still on
    if (cameraOKRef.current) startPreviewLoop()
    onDone()
  }

  // ─── Main recording flow ──────────────────────────────────────────────────
  async function startRecording() {
    // Stop preview during recording
    stopPreviewLoop()

    // 1. Screen capture
    let screenStream: MediaStream
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
      })
    } catch {
      setPhase('idle')
      if (cameraOKRef.current) startPreviewLoop()
      return
    }
    screenStreamRef.current = screenStream

    // 2. Camera — reuse existing stream if already initialized from preview
    if (cameraEnabled && !cameraOKRef.current) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        cameraStreamRef.current = camStream
        const s = camStream.getVideoTracks()[0]?.getSettings()
        camWRef.current = s?.width ?? 640
        camHRef.current = s?.height ?? 480
        cameraOKRef.current = true
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = camStream
          await cameraVideoRef.current.play()
        }
      } catch {
        setCameraError(true)
      }
    }

    // 3. Countdown
    if (countdownSecs > 0) {
      setCountdown(countdownSecs)
      setPhase('countdown')
      await new Promise<void>(resolve => {
        let remaining = countdownSecs
        const timer = setInterval(() => {
          remaining -= 1
          setCountdown(remaining)
          if (remaining <= 0) { clearInterval(timer); resolve() }
        }, 1000)
      })
    }

    // 4. Canvas pipeline
    const videoTrack    = screenStream.getVideoTracks()[0]
    const trackSettings = videoTrack?.getSettings()
    const cw = trackSettings?.width  ?? 1920
    const ch = trackSettings?.height ?? 1080

    const canvas = document.createElement('canvas')
    canvas.width  = cw
    canvas.height = ch
    compositeCanvasRef.current = canvas

    const screenVideoEl = document.createElement('video')
    screenVideoEl.srcObject = screenStream
    screenVideoEl.playsInline = true
    screenVideoEl.muted = true
    screenVideoRef.current = screenVideoEl
    await screenVideoEl.play()

    const canvasStream = canvas.captureStream(30)
    const canvasTrack  = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
    canvasTrackRef.current = canvasTrack

    const audioTracks  = screenStream.getAudioTracks()
    const outputStream = new MediaStream([canvasTrack, ...audioTracks])

    const mimeType = MIME_TYPES.find(t => MediaRecorder.isTypeSupported(t)) ?? 'video/webm'
    mimeTypeRef.current = mimeType
    chunksRef.current   = []

    const recorder = new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond: 8_000_000 })
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = handleRecordingStop
    recorderRef.current = recorder

    videoTrack?.addEventListener('ended', () => {
      if (phaseRef.current !== 'idle') handleStop()
    })

    // 5. Start
    startCompositeLoop()
    recorder.start(100)
    setElapsed(0)
    startElapsedTimer()
    setPhase('recording')
  }

  function handlePause() {
    try { recorderRef.current?.pause() } catch { handleStop(); return }
    stopCompositeLoop()
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    setPhase('paused')
  }

  function handleResume() {
    recorderRef.current?.resume()
    startCompositeLoop()
    startElapsedTimer()
    setPhase('recording')
  }

  function handleStop() {
    stopCompositeLoop()
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    setPhase('processing')
    recorderRef.current?.stop()
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    // Camera stream stays alive so preview can resume after stop
  }

  const isActive = phase !== 'idle'

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-1 pb-4">
      {/* Hidden camera video element */}
      <video ref={cameraVideoRef} className="hidden" playsInline muted />

      {/* Settings */}
      <GlassCard className="p-4">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">录屏设置</h3>
        <div className={isActive ? 'pointer-events-none opacity-40' : ''}>
          <Slider
            label="倒计时"
            value={countdownSecs}
            min={0} max={10} step={1}
            onChange={v => setCountdownSecs(v)}
            formatValue={v => v === 0 ? '无' : `${v} 秒`}
          />

          {/* Camera toggle */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-white/60">摄像头画中画</span>
            <button
              type="button"
              onClick={toggleCamera}
              className={`relative w-9 h-5 rounded-full overflow-hidden transition-colors duration-200 ${
                cameraEnabled ? 'bg-blue-500' : 'bg-white/20'
              }`}
            >
              <span className={`absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                cameraEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
          {cameraError && (
            <p className="mt-2 text-[10px] text-amber-400/80">摄像头权限被拒，将仅录屏（无画中画）</p>
          )}

          {/* PiP settings + live preview */}
          {cameraEnabled && (
            <div className="mt-4 space-y-4 border-t border-white/8 pt-4">

              {/* Live preview canvas */}
              {cameraReady && (
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  <canvas
                    ref={previewCanvasRef}
                    width={PV_W}
                    height={PV_H}
                    className="w-full block"
                  />
                  <p className="text-center text-[9px] text-white/25 py-1">实时预览</p>
                </div>
              )}

              <Slider
                label="大小"
                value={pipSize}
                min={10} max={50} step={1}
                onChange={updatePipSize}
                formatValue={v => `${v}%`}
              />

              <div>
                <p className="text-xs text-white/60 mb-2">形状</p>
                <div className="flex gap-2">
                  {SHAPES.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      title={s.title}
                      onClick={() => updatePipShape(s.id)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-sm transition-all',
                        pipShape === s.id
                          ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/8',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-white/60 mb-2">位置</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CORNERS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => updatePipCorner(c.id)}
                      className={cn(
                        'py-1.5 rounded-lg border text-sm transition-all',
                        pipCorner === c.id
                          ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/8',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </GlassCard>

      {/* Controls */}
      <GlassCard className="p-4">
        {phase === 'idle' && (
          <GlassButton variant="primary" className="w-full justify-center" onClick={startRecording}>
            开始录屏
          </GlassButton>
        )}

        {phase === 'countdown' && (
          <div className="flex flex-col items-center gap-2 py-2">
            <span className="text-xs text-white/50">准备中...</span>
            <span className="text-5xl font-bold text-blue-300">{countdown}</span>
          </div>
        )}

        {(phase === 'recording' || phase === 'paused') && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {phase === 'recording'
                ? <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                : <span className="text-sm text-white/50">⏸</span>}
              <span className="text-sm font-mono text-white/80">{formatElapsed(elapsed)}</span>
            </div>
            <div className="flex gap-2">
              {phase === 'recording'
                ? <GlassButton variant="ghost" className="flex-1 justify-center" onClick={handlePause}>暂停</GlassButton>
                : <GlassButton variant="ghost" className="flex-1 justify-center" onClick={handleResume}>继续</GlassButton>}
              <GlassButton variant="ghost" className="flex-1 justify-center" onClick={handleStop}>停止</GlassButton>
            </div>
          </div>
        )}

        {phase === 'processing' && (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="text-sm text-white/50">⏳ 处理中...</span>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
