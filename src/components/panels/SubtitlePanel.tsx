import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Wand2, ChevronDown, ChevronUp, Languages, Loader2, Bold } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { buildWhisperPrompt } from '@/constants/vocabulary'
import { formatTime, generateId } from '@/lib/utils'
import type { SubtitleSegment } from '@/types'
import { cn } from '@/lib/utils'

type BilingualLayout = 'en-top' | 'zh-top' | 'single-en' | 'single-zh' | 'none'
type SubtitlePreset = 'netflix' | 'plain' | 'outline' | 'karaoke'
type FontFamilyType = 'Inter' | 'Cormorant Garamond' | 'Noto Serif SC' | 'Plus Jakarta Sans'

const STYLE_PRESETS = [
  { id: 'netflix', label: 'Netflix', desc: '半透明黑底白字' },
  { id: 'plain', label: '纯文字', desc: '纯白文字无背景' },
  { id: 'outline', label: '描边', desc: '白字黑色描边' },
  { id: 'karaoke', label: 'Karaoke', desc: '黄色高亮' },
]

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond' },
  { value: 'Noto Serif SC', label: '思源宋体' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans' },
]

const LAYOUT_OPTIONS = [
  { value: 'none', label: '无字幕' },
  { value: 'single-en', label: '英文单语' },
  { value: 'single-zh', label: '中文单语' },
  { value: 'en-top', label: '英上中下' },
  { value: 'zh-top', label: '中上英下' },
]

// Decode compressed video/audio file → 16 kHz mono Float32Array (main thread only)
async function decodeAudioTo16kHz(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()
  const targetLength = Math.ceil(decoded.duration * 16000)
  const offlineCtx = new OfflineAudioContext(1, targetLength, 16000)
  const source = offlineCtx.createBufferSource()
  source.buffer = decoded
  source.connect(offlineCtx.destination)
  source.start(0)
  const rendered = await offlineCtx.startRendering()
  return rendered.getChannelData(0)
}

// Translate text using MyMemory free API
async function translateText(text: string, from: 'en' | 'zh'): Promise<string> {
  const langpair = from === 'en' ? 'en|zh-CN' : 'zh-CN|en'
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`
  const res = await fetch(url)
  const data = await res.json()
  return data?.responseData?.translatedText || text
}

// Translate all segments in batches
async function translateSegments(
  segments: SubtitleSegment[],
  direction: 'en-to-zh' | 'zh-to-en',
  onProgress: (pct: number) => void
): Promise<SubtitleSegment[]> {
  const result = [...segments]
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (direction === 'en-to-zh' && seg.textEn) {
      result[i] = { ...seg, textZh: await translateText(seg.textEn, 'en') }
    } else if (direction === 'zh-to-en' && seg.textZh) {
      result[i] = { ...seg, textEn: await translateText(seg.textZh, 'zh') }
    }
    onProgress(Math.round(((i + 1) / segments.length) * 100))
    // Small delay to avoid rate limiting
    if (i < segments.length - 1) await new Promise(r => setTimeout(r, 150))
  }
  return result
}

export function SubtitlePanel() {
  const {
    subtitle, videoFile,
    updateSubtitle, setSegments, setProcessing,
    isProcessing, processingProgress, processingStatus,
  } = useProjectStore()
  const [customTerms, setCustomTerms] = useState<string[]>([])
  const [termInput, setTermInput] = useState('')
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateProgress, setTranslateProgress] = useState(0)
  const [sourceLanguage, setSourceLanguage] = useState<'en' | 'zh'>('en')
  const workerRef = useRef<Worker | null>(null)

  const isBilingual = subtitle.layout === 'en-top' || subtitle.layout === 'zh-top'
  const useSharedBox = isBilingual && (subtitle.enStyle.preset === 'netflix' || subtitle.enStyle.preset === 'karaoke')
  const hasEnglish = subtitle.segments.some(s => s.textEn)
  const hasChinese = subtitle.segments.some(s => s.textZh)

  const addTerm = () => {
    if (termInput.trim() && !customTerms.includes(termInput.trim())) {
      setCustomTerms([...customTerms, termInput.trim()])
      setTermInput('')
    }
  }

  const startASR = async () => {
    if (!videoFile) return
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../../workers/asr.worker.ts', import.meta.url), { type: 'module' })
    }
    const worker = workerRef.current
    setProcessing(true, 0, '加载模型中...')

    // single-zh + English source → transcribe as English then translate (best accuracy)
    // single-zh + Chinese source → transcribe directly as Chinese with Simplified prompt
    // bilingual / single-en → always transcribe as English
    const isZhFromEn = subtitle.layout === 'single-zh' && sourceLanguage === 'en'
    const lang = (subtitle.layout === 'single-zh' && sourceLanguage === 'zh') ? 'chinese' : 'english'
    const prompt = lang === 'chinese'
      ? `以下是普通话语音识别，请使用简体中文。${customTerms.length ? customTerms.join('、') + '。' : ''}`
      : buildWhisperPrompt(customTerms)

    // Local mutable progress tracker to avoid stale closure on processingProgress state
    let currentProgress = 0

    worker.onmessage = async (e: MessageEvent) => {
      const { type, payload } = e.data
      if (type === 'STATUS') setProcessing(true, currentProgress, payload)
      if (type === 'LOADED') {
        // Decode audio on main thread (OfflineAudioContext not available in workers)
        currentProgress = 10
        setProcessing(true, 10, '解析音频...')
        let audioData: Float32Array
        try {
          const arrayBuffer = await videoFile.arrayBuffer()
          audioData = await decodeAudioTo16kHz(arrayBuffer)
        } catch (err) {
          setProcessing(false, 0, '')
          alert('音频解析失败: ' + String(err))
          return
        }
        currentProgress = 20
        setProcessing(true, 20, '识别中...')
        // Transfer Float32Array zero-copy to worker
        worker.postMessage(
          { type: 'TRANSCRIBE', payload: { audioData, language: lang, initialPrompt: prompt } },
          [audioData.buffer],
        )
      }
      if (type === 'PROGRESS') {
        currentProgress = Math.min(85, currentProgress + 5)
        setProcessing(true, currentProgress, '识别中...')
      }
      if (type === 'RESULT') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunks = payload.chunks || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let segments: SubtitleSegment[] = chunks.map((c: any) => ({
          id: generateId(),
          startTime: c.timestamp[0] || 0,
          endTime: c.timestamp[1] || (c.timestamp[0] + 3),
          textEn: lang === 'english' ? c.text.trim() : '',
          textZh: lang === 'chinese' ? c.text.trim() : '',
        }))

        // single-zh + English source: translate en→zh then clear English field
        if (isZhFromEn) {
          setProcessing(true, 90, '翻译中...')
          try {
            segments = await translateSegments(segments, 'en-to-zh', (pct) => {
              setProcessing(true, 90 + Math.round(pct * 0.1), `翻译中 ${pct}%`)
            })
            segments = segments.map(s => ({ ...s, textEn: '' }))
          } catch {
            // keep textEn as fallback display
          }
        } else if (isBilingual) {
          // Bilingual: auto-translate the other language
          setProcessing(true, 90, '翻译中...')
          try {
            const direction = lang === 'english' ? 'en-to-zh' : 'zh-to-en'
            segments = await translateSegments(segments, direction, (pct) => {
              setProcessing(true, 90 + Math.round(pct * 0.1), `翻译中 ${pct}%`)
            })
          } catch {
            // Translation failed silently, user can manually translate
          }
        }

        setSegments(segments)
        setProcessing(false, 100, '完成')
      }
      if (type === 'ERROR') {
        setProcessing(false, 0, '')
        console.error('ASR error:', payload)
        alert('识别失败: ' + payload)
      }
    }

    worker.postMessage({ type: 'LOAD' })
  }

  const handleManualTranslate = async () => {
    if (!subtitle.segments.length || isTranslating) return
    setIsTranslating(true)
    setTranslateProgress(0)
    try {
      const direction = hasEnglish ? 'en-to-zh' : 'zh-to-en'
      const translated = await translateSegments(subtitle.segments, direction, setTranslateProgress)
      setSegments(translated)
    } finally {
      setIsTranslating(false)
      setTranslateProgress(0)
    }
  }

  const deleteSegment = (id: string) => {
    updateSubtitle({ segments: subtitle.segments.filter(s => s.id !== id) })
  }

  const updateSegment = (id: string, field: keyof SubtitleSegment, value: string | number) => {
    updateSubtitle({
      segments: subtitle.segments.map(s => s.id === id ? { ...s, [field]: value } : s)
    })
  }

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto px-1 pb-4">
      {/* Layout */}
      <GlassCard className="p-4">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">字幕布局</h3>
        <Select
          value={subtitle.layout}
          options={LAYOUT_OPTIONS}
          onChange={(v) => updateSubtitle({ layout: v as BilingualLayout })}
        />
        {subtitle.layout === 'single-zh' && (
          <div className="mt-3">
            <p className="text-xs text-white/50 mb-2">视频语言</p>
            <div className="flex gap-2">
              {(['en', 'zh'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setSourceLanguage(l)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg border text-xs transition-all',
                    sourceLanguage === l
                      ? 'border-blue-400/50 bg-blue-500/15 text-blue-200'
                      : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10'
                  )}
                >
                  {l === 'en' ? '英文视频' : '中文视频'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-white/25 mt-1.5">
              {sourceLanguage === 'en' ? '英文识别后自动翻译为简体中文' : '直接识别中文语音'}
            </p>
          </div>
        )}
      </GlassCard>

      {/* ASR — hidden when layout is 'none' */}
      {subtitle.layout !== 'none' && (
        <GlassCard className="p-4">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">语音识别</h3>
          {!videoFile ? (
            <p className="text-xs text-white/30 text-center py-2">请先上传视频</p>
          ) : (
            <>
              <GlassButton
                variant="primary"
                className="w-full mb-3"
                onClick={startASR}
                disabled={isProcessing}
              >
                <Wand2 className="w-3.5 h-3.5" />
                {isProcessing ? processingStatus : '开始识别'}
              </GlassButton>
              {isProcessing && (
                <div className="space-y-1">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${processingProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="text-xs text-white/40">{processingStatus}</p>
                </div>
              )}
            </>
          )}

          {/* Manual translate button */}
          {subtitle.segments.length > 0 && isBilingual && (hasEnglish || hasChinese) && (
            <div className="mt-3">
              <GlassButton
                variant="ghost"
                className="w-full"
                onClick={handleManualTranslate}
                disabled={isTranslating}
              >
                {isTranslating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />翻译中 {translateProgress}%</>
                  : <><Languages className="w-3.5 h-3.5" />自动翻译{hasEnglish && !hasChinese ? '为中文' : '为英文'}</>
                }
              </GlassButton>
            </div>
          )}

          {/* Custom terms */}
          <div className="mt-3 space-y-2">
            <p className="text-xs text-white/50">自定义词汇</p>
            <div className="flex gap-2">
              <input
                value={termInput}
                onChange={e => setTermInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTerm()}
                placeholder="输入专有名词..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder-white/25 focus:outline-none focus:border-blue-400/40"
              />
              <GlassButton size="sm" onClick={addTerm}><Plus className="w-3 h-3" /></GlassButton>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {customTerms.map(term => (
                <span key={term} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-400/25 text-xs text-blue-200">
                  {term}
                  <button onClick={() => setCustomTerms(customTerms.filter(t => t !== term))} className="hover:text-white">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </GlassCard>
      )}

      {/* Style — hidden when layout is 'none' */}
      {subtitle.layout !== 'none' && (
        <GlassCard className="p-4">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">字幕风格</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {STYLE_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => updateSubtitle({
                  enStyle: { ...subtitle.enStyle, preset: preset.id as SubtitlePreset },
                  zhStyle: { ...subtitle.zhStyle, preset: preset.id as SubtitlePreset }
                })}
                className={cn(
                  'p-2 rounded-xl border text-left transition-all duration-150',
                  subtitle.enStyle.preset === preset.id
                    ? 'border-blue-400/50 bg-blue-500/15 text-blue-200'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                )}
              >
                <div className="text-xs font-medium">{preset.label}</div>
                <div className="text-[10px] opacity-60 mt-0.5">{preset.desc}</div>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {/* EN style — shown for single-en or bilingual */}
            {(subtitle.layout === 'single-en' || isBilingual) && (<>
              <Select
                label={isBilingual ? '英文字体' : '字体'}
                value={subtitle.enStyle.fontFamily}
                options={FONT_OPTIONS}
                onChange={(v) => updateSubtitle({ enStyle: { ...subtitle.enStyle, fontFamily: v as FontFamilyType } })}
              />
              <Slider label={isBilingual ? '英文字号' : '字号'} value={subtitle.enStyle.fontSize} min={14} max={48}
                onChange={(v) => updateSubtitle({ enStyle: { ...subtitle.enStyle, fontSize: v } })}
                formatValue={v => `${v}px`}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">{isBilingual ? '英文加粗' : '加粗'}</span>
                <button
                  onClick={() => updateSubtitle({ enStyle: { ...subtitle.enStyle, bold: !subtitle.enStyle.bold } })}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs transition-all duration-150',
                    subtitle.enStyle.bold
                      ? 'bg-blue-500/20 border-blue-400/40 text-blue-200'
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                  )}
                >
                  <Bold className="w-3 h-3" />
                  {subtitle.enStyle.bold ? '已加粗' : '加粗'}
                </button>
              </div>
              <ColorPicker label={isBilingual ? '英文颜色' : '颜色'} value={subtitle.enStyle.color}
                onChange={(v) => updateSubtitle({ enStyle: { ...subtitle.enStyle, color: v } })}
              />
            </>)}

            {/* ZH style — shown for single-zh or bilingual */}
            {(subtitle.layout === 'single-zh' || isBilingual) && (<>
              <Select
                label={isBilingual ? '中文字体' : '字体'}
                value={subtitle.zhStyle.fontFamily}
                options={FONT_OPTIONS.filter(f => f.value === 'Noto Serif SC' || f.value === 'Inter')}
                onChange={(v) => updateSubtitle({ zhStyle: { ...subtitle.zhStyle, fontFamily: v as FontFamilyType } })}
              />
              <Slider label={isBilingual ? '中文字号' : '字号'} value={subtitle.zhStyle.fontSize} min={14} max={48}
                onChange={(v) => updateSubtitle({ zhStyle: { ...subtitle.zhStyle, fontSize: v } })}
                formatValue={v => `${v}px`}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">{isBilingual ? '中文加粗' : '加粗'}</span>
                <button
                  onClick={() => updateSubtitle({ zhStyle: { ...subtitle.zhStyle, bold: !subtitle.zhStyle.bold } })}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs transition-all duration-150',
                    subtitle.zhStyle.bold
                      ? 'bg-blue-500/20 border-blue-400/40 text-blue-200'
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                  )}
                >
                  <Bold className="w-3 h-3" />
                  {subtitle.zhStyle.bold ? '已加粗' : '加粗'}
                </button>
              </div>
              <ColorPicker label={isBilingual ? '中文颜色' : '颜色'} value={subtitle.zhStyle.color}
                onChange={(v) => updateSubtitle({ zhStyle: { ...subtitle.zhStyle, color: v } })}
              />
            </>)}
          </div>
        </GlassCard>
      )}

      {/* Position — hidden when layout is 'none' */}
      {subtitle.layout !== 'none' && (
        <GlassCard className="p-4">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">字幕位置</h3>
          <div className="space-y-3">
            {/* Bilingual + shared box (netflix/karaoke): single position anchor */}
            {isBilingual && useSharedBox && (
              <>
                <Slider label="水平" value={subtitle.enPosition.x} min={0} max={100}
                  onChange={v => updateSubtitle({ enPosition: { ...subtitle.enPosition, x: v } })}
                  formatValue={v => `${v}%`}
                />
                <Slider label="垂直" value={subtitle.enPosition.y} min={0} max={100}
                  onChange={v => updateSubtitle({ enPosition: { ...subtitle.enPosition, y: v } })}
                  formatValue={v => `${v}%`}
                />
              </>
            )}
            {/* Bilingual + separate boxes (plain/outline): two independent positions */}
            {isBilingual && !useSharedBox && (
              <>
                <Slider label="英文 水平" value={subtitle.enPosition.x} min={0} max={100}
                  onChange={v => updateSubtitle({ enPosition: { ...subtitle.enPosition, x: v } })}
                  formatValue={v => `${v}%`}
                />
                <Slider label="英文 垂直" value={subtitle.enPosition.y} min={0} max={100}
                  onChange={v => updateSubtitle({ enPosition: { ...subtitle.enPosition, y: v } })}
                  formatValue={v => `${v}%`}
                />
                <Slider label="中文 水平" value={subtitle.zhPosition.x} min={0} max={100}
                  onChange={v => updateSubtitle({ zhPosition: { ...subtitle.zhPosition, x: v } })}
                  formatValue={v => `${v}%`}
                />
                <Slider label="中文 垂直" value={subtitle.zhPosition.y} min={0} max={100}
                  onChange={v => updateSubtitle({ zhPosition: { ...subtitle.zhPosition, y: v } })}
                  formatValue={v => `${v}%`}
                />
              </>
            )}
            {/* Single language */}
            {subtitle.layout === 'single-en' && (
              <>
                <Slider label="水平" value={subtitle.enPosition.x} min={0} max={100}
                  onChange={v => updateSubtitle({ enPosition: { ...subtitle.enPosition, x: v } })}
                  formatValue={v => `${v}%`}
                />
                <Slider label="垂直" value={subtitle.enPosition.y} min={0} max={100}
                  onChange={v => updateSubtitle({ enPosition: { ...subtitle.enPosition, y: v } })}
                  formatValue={v => `${v}%`}
                />
              </>
            )}
            {subtitle.layout === 'single-zh' && (
              <>
                <Slider label="水平" value={subtitle.zhPosition.x} min={0} max={100}
                  onChange={v => updateSubtitle({ zhPosition: { ...subtitle.zhPosition, x: v } })}
                  formatValue={v => `${v}%`}
                />
                <Slider label="垂直" value={subtitle.zhPosition.y} min={0} max={100}
                  onChange={v => updateSubtitle({ zhPosition: { ...subtitle.zhPosition, y: v } })}
                  formatValue={v => `${v}%`}
                />
              </>
            )}
          </div>
        </GlassCard>
      )}

      {/* Segments List */}
      {subtitle.layout !== 'none' && subtitle.segments.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">
            字幕片段 ({subtitle.segments.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {subtitle.segments.map((seg) => (
              <div key={seg.id} className="border border-white/[0.08] rounded-xl bg-white/[0.03] overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
                  onClick={() => setExpandedSegment(expandedSegment === seg.id ? null : seg.id)}
                >
                  <span className="text-[10px] text-white/40 font-mono">{formatTime(seg.startTime).slice(0, 8)}</span>
                  <span className="text-xs text-white/70 flex-1 mx-2 truncate">{seg.textEn || seg.textZh}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSegment(seg.id) }}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {expandedSegment === seg.id
                      ? <ChevronUp className="w-3 h-3 text-white/30" />
                      : <ChevronDown className="w-3 h-3 text-white/30" />
                    }
                  </div>
                </div>
                <AnimatePresence>
                  {expandedSegment === seg.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-3 pb-3 space-y-2 border-t border-white/[0.08]"
                    >
                      <input
                        value={seg.textEn}
                        onChange={e => updateSegment(seg.id, 'textEn', e.target.value)}
                        placeholder="English text..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/80 placeholder-white/20 focus:outline-none mt-2"
                      />
                      <input
                        value={seg.textZh}
                        onChange={e => updateSegment(seg.id, 'textZh', e.target.value)}
                        placeholder="中文字幕..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/80 placeholder-white/20 focus:outline-none"
                        style={{ fontFamily: 'Noto Serif SC, serif' }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}
