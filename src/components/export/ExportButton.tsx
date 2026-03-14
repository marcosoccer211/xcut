import { useState } from 'react'
import { Download, Loader2, FileText } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { GlassButton } from '@/components/ui/GlassButton'
import { formatTime, getAspectRatioDimensions } from '@/lib/utils'
import { drawVideoFrame } from '@/lib/drawFrame'

// Convert a WebM blob to MP4 using FFmpeg WASM (fallback for older browsers)
async function convertWebmToMp4(
  webmBlob: Blob,
  onProgress: (status: string) => void,
): Promise<Blob> {
  onProgress('加载转码器...')
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  onProgress('转码为 MP4...')
  const webmData = new Uint8Array(await webmBlob.arrayBuffer())
  await ffmpeg.writeFile('input.webm', webmData)
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  const data = await ffmpeg.readFile('output.mp4')
  const src = data instanceof Uint8Array ? data : new Uint8Array(0)
  const plain = new Uint8Array(src.length)
  plain.set(src)
  return new Blob([plain.buffer as ArrayBuffer], { type: 'video/mp4' })
}

export function ExportButton() {
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState('')
  const { videoFile, subtitle, title, background, clips } = useProjectStore()

  const exportSRT = () => {
    if (!subtitle.segments.length) return
    const showEn = subtitle.layout !== 'single-zh'
    const showZh = subtitle.layout !== 'single-en'
    let srt = ''
    subtitle.segments.forEach((seg, i) => {
      srt += `${i + 1}\n`
      srt += `${formatTime(seg.startTime)} --> ${formatTime(seg.endTime)}\n`
      if (showEn && seg.textEn) srt += seg.textEn + '\n'
      if (showZh && seg.textZh) srt += seg.textZh + '\n'
      srt += '\n'
    })
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'xcut-subtitles.srt'; a.click()
    URL.revokeObjectURL(url)
  }

  const exportVideo = async () => {
    if (!videoFile) return
    setIsExporting(true)
    setStatus('准备中...')

    try {
      const { w, h } = getAspectRatioDimensions(background.aspectRatio)
      const cw = 1280
      const ch = Math.round(cw / (w / h))

      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')!

      const srcUrl = URL.createObjectURL(videoFile)
      const video = document.createElement('video')
      video.src = srcUrl
      video.playsInline = true
      video.muted = true
      video.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('视频加载失败'))
      })

      const duration = video.duration

      // Capture audio from video element
      let audioTracks: MediaStreamTrack[] = []
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vs = (video as any).captureStream?.() as MediaStream | undefined
        if (vs) audioTracks = vs.getAudioTracks()
      } catch { /* no audio capture support */ }

      // captureStream(30) — browser auto-captures at 30 fps, audio & video share
      // the same clock so they stay in sync.  captureStream(0) + requestFrame()
      // drifts because manual push timing doesn't align with the audio timeline.
      const canvasStream = canvas.captureStream(30)
      const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])

      // Prefer MP4 (Chrome 130+ native support) — avoids any re-encoding
      const mimeType = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find(t => MediaRecorder.isTypeSupported(t)) ?? 'video/webm'

      // 4 Mbps is plenty for 1280-wide H.264; 8 Mbps was accumulating gigabytes
      // in RAM for longer recordings and causing out-of-memory crashes.
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
      const chunks: BlobPart[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      // Just draw — captureStream(30) auto-grabs whatever is on canvas
      const drawAndPush = () => {
        drawVideoFrame(ctx, video, subtitle, title, background)
      }

      // Use clip list if available, otherwise treat whole video as one clip
      const clipsToExport = clips.length > 0
        ? clips
        : [{ id: '', start: 0, end: duration }]

      await new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve()
        recorder.onerror = () => reject(new Error('录制失败'))

        // ── Frame loop ────────────────────────────────────────────────────
        // requestVideoFrameCallback fires exactly once per decoded video frame
        // (typically 24–30 fps), so we never waste GPU time re-encoding the
        // same frame twice.  Falls back to a 30-fps-capped rAF on older browsers.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoAny = video as any
        const hasRVFC = typeof videoAny.requestVideoFrameCallback === 'function'

        let exportActive = true
        let animFrame = 0
        let rvfcPending = false

        const scheduleFrame = () => {
          if (!exportActive || rvfcPending) return
          rvfcPending = true
          videoAny.requestVideoFrameCallback(() => {
            rvfcPending = false
            if (!exportActive) return
            drawAndPush()
            scheduleFrame()
          })
        }

        let rafLastTime = 0
        const rafLoop = (t: number) => {
          if (!exportActive) return
          if (t - rafLastTime >= 33) { drawAndPush(); rafLastTime = t }
          animFrame = requestAnimationFrame(rafLoop)
        }

        const stopDraw = () => {
          exportActive = false
          cancelAnimationFrame(animFrame)
        }

        let clipIndex = 0

        const seekAndPlay = () => {
          if (clipIndex >= clipsToExport.length) {
            stopDraw()
            setTimeout(() => recorder.stop(), 200)
            return
          }
          const clip = clipsToExport[clipIndex]
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked)
            video.play().catch(reject)
            // Restart RVFC chain in case it stalled while video was paused
            if (hasRVFC) scheduleFrame()
          }
          video.addEventListener('seeked', onSeeked)
          video.currentTime = clip.start
        }

        video.ontimeupdate = () => {
          const clip = clipsToExport[clipIndex]
          if (!clip) return

          // Progress: distribute across all clips
          const clipsDone = clipsToExport.slice(0, clipIndex).reduce((s, c) => s + (c.end - c.start), 0)
          const clipProgress = video.currentTime - clip.start
          const totalDur = clipsToExport.reduce((s, c) => s + (c.end - c.start), 0)
          const pct = Math.round(((clipsDone + clipProgress) / totalDur) * 100)
          setStatus(`录制中 ${pct}%`)

          if (video.currentTime >= clip.end) {
            video.pause()
            clipIndex++
            seekAndPlay()
          }
        }

        // Kick off
        if (hasRVFC) {
          scheduleFrame()
        } else {
          animFrame = requestAnimationFrame(rafLoop)
        }
        recorder.start(100)
        seekAndPlay()
      })

      URL.revokeObjectURL(srcUrl)

      // If browser recorded as WebM, convert to MP4 via FFmpeg WASM
      let blob = new Blob(chunks, { type: mimeType })
      let filename = 'xcut-export.mp4'

      if (!mimeType.includes('mp4')) {
        try {
          blob = await convertWebmToMp4(blob, setStatus)
        } catch (convErr) {
          // Conversion failed — fall back to WebM download
          console.warn('MP4 conversion failed, downloading WebM:', convErr)
          filename = 'xcut-export.webm'
          blob = new Blob(chunks, { type: mimeType })
        }
      }

      setStatus('保存文件...')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)

    } catch (err) {
      console.error('Export failed:', err)
      alert('导出失败: ' + String(err))
    } finally {
      setIsExporting(false)
      setStatus('')
    }
  }

  return (
    <div className="flex items-center gap-2">
      {subtitle.segments.length > 0 && (
        <GlassButton size="sm" onClick={exportSRT} variant="ghost" title="导出 SRT 字幕文件">
          <FileText className="w-3.5 h-3.5" />
          SRT
        </GlassButton>
      )}
      <GlassButton
        size="sm"
        variant="primary"
        onClick={exportVideo}
        disabled={!videoFile || isExporting}
        title={isExporting ? status : '导出 MP4 视频（含字幕和标题）'}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="max-w-[80px] truncate">{status || '准备中...'}</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            导出 MP4
          </>
        )}
      </GlassButton>
    </div>
  )
}
