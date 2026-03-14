import { getAspectRatioDimensions } from '@/lib/utils'
import type { SubtitleConfig, SubtitleStyle, TitleConfig, BackgroundConfig } from '@/types'

function getBlurPx(level: number): number {
  return [0, 8, 18, 32, 52][level]
}

// ── Blur optimisation ────────────────────────────────────────────────────────
// ctx.filter='blur(Xpx)' on a 1280×720 canvas touches ~1M pixels per frame and
// is the single biggest GPU bottleneck during export.
// Fix: render the blurred background into a 1/8-scale offscreen canvas first,
// then upscale.  Applying blur(X/8 px) on 160×90 and scaling back up produces
// a visually indistinguishable result at ~40–60× lower GPU cost.
const BLUR_DOWN = 8
let _blurCanvas: HTMLCanvasElement | null = null
let _blurCtx: CanvasRenderingContext2D | null = null

function getBlurCanvas(cw: number, ch: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const bw = Math.ceil(cw / BLUR_DOWN)
  const bh = Math.ceil(ch / BLUR_DOWN)
  if (!_blurCanvas || _blurCanvas.width !== bw || _blurCanvas.height !== bh) {
    _blurCanvas = document.createElement('canvas')
    _blurCanvas.width = bw
    _blurCanvas.height = bh
    _blurCtx = _blurCanvas.getContext('2d', { alpha: false })!
  }
  return { c: _blurCanvas, ctx: _blurCtx! }
}

// Detect if text contains CJK characters (Chinese/Japanese/Korean)
function isCJK(text: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text)
}

// Word-wrap text to fit within maxWidth — handles both English and Chinese
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text]
  const lines: string[] = []

  if (isCJK(text)) {
    // Character-by-character wrapping for Chinese
    let current = ''
    for (const char of text) {
      const test = current + char
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current)
        current = char
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
  } else {
    // Word-by-word wrapping for English
    const words = text.split(' ')
    let current = ''
    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
  }

  return lines.length ? lines : [text]
}

function renderSubtitleText(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: SubtitleStyle,
  x: number,
  y: number,
  maxWidth: number
) {
  if (!text) return
  ctx.save()
  ctx.font = `${style.bold ? 'bold ' : ''}${style.fontSize}px "${style.fontFamily}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lineHeight = style.fontSize * 1.4
  const padX = 20
  const padY = 10
  const wrapWidth = maxWidth - padX * 2
  const lines = wrapText(ctx, text, wrapWidth)

  const blockH = lines.length * lineHeight + padY * 2
  const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width))
  const blockW = Math.min(maxLineW + padX * 2, maxWidth)

  // Draw background box (netflix / karaoke)
  if (style.preset === 'netflix' || style.preset === 'karaoke') {
    ctx.fillStyle = style.backgroundColor
    const rx = x - blockW / 2
    const ry = y - blockH / 2
    const r = 8
    ctx.beginPath()
    ctx.moveTo(rx + r, ry)
    ctx.lineTo(rx + blockW - r, ry)
    ctx.arcTo(rx + blockW, ry, rx + blockW, ry + r, r)
    ctx.lineTo(rx + blockW, ry + blockH - r)
    ctx.arcTo(rx + blockW, ry + blockH, rx + blockW - r, ry + blockH, r)
    ctx.lineTo(rx + r, ry + blockH)
    ctx.arcTo(rx, ry + blockH, rx, ry + blockH - r, r)
    ctx.lineTo(rx, ry + r)
    ctx.arcTo(rx, ry, rx + r, ry, r)
    ctx.closePath()
    ctx.fill()
  }

  if (style.shadowEnabled) {
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
  }

  const textColor = style.preset === 'karaoke' ? '#FFD700' : style.color
  const startY = y - ((lines.length - 1) * lineHeight) / 2

  lines.forEach((line, i) => {
    const ly = startY + i * lineHeight
    if (style.preset === 'outline') {
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = Math.max(2, style.fontSize * 0.06)
      ctx.lineJoin = 'round'
      ctx.shadowColor = 'transparent'
      ctx.strokeText(line, x, ly)
      if (style.shadowEnabled) {
        ctx.shadowColor = 'rgba(0,0,0,0.9)'
        ctx.shadowBlur = 4
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1
      }
    }
    ctx.fillStyle = textColor
    ctx.fillText(line, x, ly)
  })

  ctx.restore()
}

// Render two subtitle lines (EN + ZH or ZH + EN) inside a single shared box
function renderBilingualBox(
  ctx: CanvasRenderingContext2D,
  topText: string,
  topStyle: SubtitleStyle,
  bottomText: string,
  bottomStyle: SubtitleStyle,
  x: number,
  y: number,
  maxWidth: number
) {
  if (!topText && !bottomText) return
  ctx.save()

  const padX = 22
  const padY = 12
  const gap = 8 // gap between top and bottom lines

  // Measure top lines
  ctx.font = `${topStyle.bold ? 'bold ' : ''}${topStyle.fontSize}px "${topStyle.fontFamily}", sans-serif`
  const topLines = topText ? wrapText(ctx, topText, maxWidth - padX * 2) : []
  const topLineH = topStyle.fontSize * 1.4
  const topBlockH = topLines.length * topLineH
  const topMaxW = topLines.length ? Math.max(...topLines.map(l => ctx.measureText(l).width)) : 0

  // Measure bottom lines
  ctx.font = `${bottomStyle.bold ? 'bold ' : ''}${bottomStyle.fontSize}px "${bottomStyle.fontFamily}", sans-serif`
  const bottomLines = bottomText ? wrapText(ctx, bottomText, maxWidth - padX * 2) : []
  const bottomLineH = bottomStyle.fontSize * 1.4
  const bottomBlockH = bottomLines.length * bottomLineH
  const bottomMaxW = bottomLines.length ? Math.max(...bottomLines.map(l => ctx.measureText(l).width)) : 0

  const boxW = Math.min(Math.max(topMaxW, bottomMaxW) + padX * 2, maxWidth)
  const boxH = padY * 2 + topBlockH + (topLines.length && bottomLines.length ? gap : 0) + bottomBlockH
  const preset = topStyle.preset // both should share same preset

  // Draw background box
  if (preset === 'netflix' || preset === 'karaoke') {
    ctx.fillStyle = topStyle.backgroundColor
    const rx = x - boxW / 2
    const ry = y - boxH / 2
    const r = 8
    ctx.beginPath()
    ctx.moveTo(rx + r, ry)
    ctx.lineTo(rx + boxW - r, ry)
    ctx.arcTo(rx + boxW, ry, rx + boxW, ry + r, r)
    ctx.lineTo(rx + boxW, ry + boxH - r)
    ctx.arcTo(rx + boxW, ry + boxH, rx + boxW - r, ry + boxH, r)
    ctx.lineTo(rx + r, ry + boxH)
    ctx.arcTo(rx, ry + boxH, rx, ry + boxH - r, r)
    ctx.lineTo(rx, ry + r)
    ctx.arcTo(rx, ry, rx + r, ry, r)
    ctx.closePath()
    ctx.fill()
  }

  // Draw top lines
  const topStartY = y - boxH / 2 + padY + topLineH / 2
  ctx.font = `${topStyle.bold ? 'bold ' : ''}${topStyle.fontSize}px "${topStyle.fontFamily}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const topColor = preset === 'karaoke' ? '#FFD700' : topStyle.color
  topLines.forEach((line, i) => {
    const ly = topStartY + i * topLineH
    if (topStyle.shadowEnabled) {
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1
    }
    if (preset === 'outline') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, topStyle.fontSize * 0.06); ctx.lineJoin = 'round'
      ctx.shadowColor = 'transparent'; ctx.strokeText(line, x, ly)
      if (topStyle.shadowEnabled) { ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4 }
    }
    ctx.fillStyle = topColor; ctx.fillText(line, x, ly)
  })

  // Draw bottom lines
  const bottomStartY = y - boxH / 2 + padY + topBlockH + (topLines.length ? gap : 0) + bottomLineH / 2
  ctx.font = `${bottomStyle.bold ? 'bold ' : ''}${bottomStyle.fontSize}px "${bottomStyle.fontFamily}", sans-serif`
  const bottomColor = preset === 'karaoke' ? '#FFD700' : bottomStyle.color
  bottomLines.forEach((line, i) => {
    const ly = bottomStartY + i * bottomLineH
    if (bottomStyle.shadowEnabled) {
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1
    }
    if (preset === 'outline') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, bottomStyle.fontSize * 0.06); ctx.lineJoin = 'round'
      ctx.shadowColor = 'transparent'; ctx.strokeText(line, x, ly)
      if (bottomStyle.shadowEnabled) { ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4 }
    }
    ctx.fillStyle = bottomColor; ctx.fillText(line, x, ly)
  })

  ctx.restore()
}

export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  subtitle: SubtitleConfig,
  title: TitleConfig,
  background: BackgroundConfig,
): void {
  if (video.readyState < 2) return

  const { w, h } = getAspectRatioDimensions(background.aspectRatio)
  const targetAspect = w / h
  const videoAspect = video.videoWidth / video.videoHeight

  const cw = ctx.canvas.width
  const ch = ctx.canvas.height

  // Fit video into target aspect ratio box
  const targetH = cw / targetAspect
  const videoFitW = targetH * videoAspect > cw ? cw : targetH * videoAspect
  const videoFitH = videoFitW / videoAspect
  const drawX = (cw - videoFitW) / 2
  const drawY = (ch - videoFitH) / 2

  ctx.clearRect(0, 0, cw, ch)

  // Blurred background fill — optimised via small-canvas downscale
  const blurPx = getBlurPx(background.blurLevel)
  if (blurPx > 0) {
    const bgAspect = video.videoWidth / video.videoHeight
    const { c: bc, ctx: bCtx } = getBlurCanvas(cw, ch)
    const bw = bc.width, bh = bc.height
    let bgW = bw, bgH = bw / bgAspect
    if (bgH < bh) { bgH = bh; bgW = bh * bgAspect }
    // Step 1: draw + blur on the tiny canvas (cheap — only 160×90 pixels)
    bCtx.filter = `blur(${Math.max(1, Math.round(blurPx / BLUR_DOWN))}px)`
    bCtx.drawImage(video, (bw - bgW) / 2, (bh - bgH) / 2, bgW, bgH)
    bCtx.filter = 'none'
    // Step 2: upscale to full canvas (a single GPU blit — essentially free)
    ctx.drawImage(bc, 0, 0, cw, ch)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, cw, ch)
  } else {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, cw, ch)
  }

  // Draw video frame
  ctx.drawImage(video, drawX, drawY, videoFitW, videoFitH)

  // Draw title — rich text spans with alignment
  const titlePlain = title.spans.map(s => s.text).join('')
  if (title.visible && titlePlain.trim()) {
    const anchorX = (title.position.x / 100) * cw
    const anchorY = (title.position.y / 100) * ch
    const lineH = title.fontSize * 1.3
    const align = title.textAlign

    // Split spans into lines at \n
    type SpanLine = { text: string; bold?: boolean; color?: string }[]
    const lines: SpanLine[] = [[]]
    for (const span of title.spans) {
      const parts = span.text.split('\n')
      parts.forEach((part, pi) => {
        if (pi > 0) lines.push([])
        if (part) lines[lines.length - 1].push({ text: part, bold: span.bold, color: span.color })
      })
    }

    const totalH = lines.length * lineH
    const startY = anchorY - totalH / 2 + lineH / 2

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.textBaseline = 'middle'

    // First pass: measure each line's total width
    const lineWidths = lines.map(lineSpans => {
      let lw = 0
      lineSpans.forEach(span => {
        const weight = (span.bold || title.bold) ? 'bold' : 'normal'
        ctx.font = `${weight} ${title.fontSize}px "${title.fontFamily}", serif`
        lw += ctx.measureText(span.text).width
      })
      return lw
    })
    const maxLineW = lineWidths.length ? Math.max(...lineWidths) : 0

    // Second pass: render — anchorX is always the horizontal center of the block
    lines.forEach((lineSpans, li) => {
      const ly = startY + li * lineH
      const lineW = lineWidths[li]

      // anchorX stays fixed; alignment only shifts each line within the block
      let curX: number
      if (align === 'left') curX = anchorX - maxLineW / 2
      else if (align === 'right') curX = anchorX + maxLineW / 2 - lineW
      else curX = anchorX - lineW / 2 // center: each line centered on anchorX

      lineSpans.forEach(span => {
        const weight = (span.bold || title.bold) ? 'bold' : 'normal'
        ctx.font = `${weight} ${title.fontSize}px "${title.fontFamily}", serif`
        ctx.fillStyle = span.color || title.color
        ctx.textAlign = 'left'
        ctx.fillText(span.text, curX, ly)
        curX += ctx.measureText(span.text).width
      })
    })
    ctx.restore()
  }

  // Draw subtitles (skip if layout is 'none')
  const active = subtitle.segments.filter(s => video.currentTime >= s.startTime && video.currentTime <= s.endTime)
  active.forEach(seg => {
    if (subtitle.layout === 'none') return

    const isBilingual = subtitle.layout === 'en-top' || subtitle.layout === 'zh-top'
    const useSharedBox = isBilingual && (subtitle.enStyle.preset === 'netflix' || subtitle.enStyle.preset === 'karaoke')

    if (useSharedBox) {
      // Combined box: position anchored to enPosition
      const sx = (subtitle.enPosition.x / 100) * cw
      const sy = (subtitle.enPosition.y / 100) * ch
      const topText = subtitle.layout === 'en-top' ? seg.textEn : seg.textZh
      const topStyle = subtitle.layout === 'en-top' ? subtitle.enStyle : subtitle.zhStyle
      const bottomText = subtitle.layout === 'en-top' ? seg.textZh : seg.textEn
      const bottomStyle = subtitle.layout === 'en-top' ? subtitle.zhStyle : subtitle.enStyle
      renderBilingualBox(ctx, topText, topStyle, bottomText, bottomStyle, sx, sy, cw * 0.9)
    } else {
      const showEn = subtitle.layout === 'single-en' || isBilingual
      const showZh = subtitle.layout === 'single-zh' || isBilingual
      if (showEn && seg.textEn) {
        const sx = (subtitle.enPosition.x / 100) * cw
        const sy = (subtitle.enPosition.y / 100) * ch
        renderSubtitleText(ctx, seg.textEn, subtitle.enStyle, sx, sy, cw * 0.9)
      }
      if (showZh && seg.textZh) {
        const sx = (subtitle.zhPosition.x / 100) * cw
        const sy = (subtitle.zhPosition.y / 100) * ch
        renderSubtitleText(ctx, seg.textZh, subtitle.zhStyle, sx, sy, cw * 0.9)
      }
    }
  })
}
