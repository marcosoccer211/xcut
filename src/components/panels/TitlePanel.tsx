import { useRef, useEffect, useCallback, useState } from 'react'
import { Bold, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import type { TitleSpan } from '@/types'
import { useProjectStore } from '@/stores/projectStore'
import { GlassCard } from '@/components/ui/GlassCard'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

const FONT_OPTIONS = [
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Noto Serif SC', label: '思源宋体' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans' },
]

// Convert spans to HTML for contenteditable
function spansToHtml(spans: TitleSpan[]): string {
  return spans.map(span => {
    // escape HTML
    const escaped = span.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')

    if (span.bold && span.color) {
      return `<span style="font-weight:bold;color:${span.color}">${escaped}</span>`
    } else if (span.bold) {
      return `<b>${escaped}</b>`
    } else if (span.color) {
      return `<span style="color:${span.color}">${escaped}</span>`
    }
    return escaped
  }).join('')
}

// Parse contenteditable innerHTML to spans
function htmlToSpans(html: string): TitleSpan[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.querySelector('div')!
  const spans: TitleSpan[] = []

  function processNode(node: Node, inheritBold: boolean, inheritColor?: string) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      if (text) {
        spans.push({
          text,
          ...(inheritBold ? { bold: true } : {}),
          ...(inheritColor ? { color: inheritColor } : {}),
        })
      }
    } else if (node.nodeName === 'BR') {
      if (spans.length > 0) {
        spans[spans.length - 1] = { ...spans[spans.length - 1], text: spans[spans.length - 1].text + '\n' }
      } else {
        spans.push({ text: '\n' })
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const bold = inheritBold || el.tagName === 'B' || el.tagName === 'STRONG' || el.style.fontWeight === 'bold'
      const color = el.style.color || (el.tagName === 'FONT' ? (el.getAttribute('color') ?? undefined) : undefined) || inheritColor
      for (const child of Array.from(node.childNodes)) {
        processNode(child, bold, color)
      }
    }
  }

  for (const child of Array.from(root.childNodes)) {
    processNode(child, false, undefined)
  }

  return spans.length ? spans : [{ text: '' }]
}

// Derive plain text from spans (for preview card)
function spansToPlainText(spans: TitleSpan[]): string {
  return spans.map(s => s.text).join('')
}

export function TitlePanel() {
  const { title, updateTitle } = useProjectStore()
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const [activeColor, setActiveColor] = useState('#ffffff')

  // Sync spans → HTML only on mount or external span changes
  const lastSpansRef = useRef<TitleSpan[]>(title.spans)
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    // Only re-sync if spans changed from outside (not from user typing)
    if (JSON.stringify(lastSpansRef.current) !== JSON.stringify(title.spans)) {
      editor.innerHTML = spansToHtml(title.spans)
      lastSpansRef.current = title.spans
    }
  }, [title.spans])

  const syncToStore = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const spans = htmlToSpans(editor.innerHTML)
    lastSpansRef.current = spans
    updateTitle({ spans })
  }, [updateTitle])

  const handleInput = () => {
    if (!isComposingRef.current) syncToStore()
  }

  const applyBold = () => {
    editorRef.current?.focus()
    document.execCommand('bold', false)
    syncToStore()
  }

  const applyColor = (color: string) => {
    setActiveColor(color)
    editorRef.current?.focus()
    document.execCommand('foreColor', false, color)
    syncToStore()
  }

  const plainText = spansToPlainText(title.spans)

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-1 pb-4">
      {/* Visibility + Editor */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest">标题文字</h3>
          <button
            onClick={() => updateTitle({ visible: !title.visible })}
            className={cn(
              'relative w-10 h-5 rounded-full transition-all duration-200 border',
              title.visible ? 'bg-blue-500/40 border-blue-400/50' : 'bg-white/10 border-white/15'
            )}
          >
            <span className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200',
              title.visible ? 'left-5 bg-blue-300' : 'left-0.5 bg-white/50'
            )} />
          </button>
        </div>

        {/* Rich text toolbar */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <button
            onMouseDown={e => { e.preventDefault(); applyBold() }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition-all"
            title="加粗选中文字"
          >
            <Bold className="w-3 h-3" />
            加粗
          </button>

          {/* Color picker for selected text */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/40">文字颜色</span>
            <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/20 cursor-pointer">
              <div className="absolute inset-0" style={{ background: activeColor }} />
              <input
                type="color"
                value={activeColor}
                onChange={e => applyColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="更改选中文字颜色"
              />
            </div>
          </div>
        </div>

        {/* Contenteditable editor */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => { isComposingRef.current = false; syncToStore() }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak') } }}
          className={cn(
            'min-h-[72px] w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2',
            'text-sm text-white/90 focus:outline-none focus:border-blue-400/30',
            'transition-all whitespace-pre-wrap break-words'
          )}
          style={{ fontFamily: title.fontFamily, lineHeight: '1.5' }}
          data-placeholder="输入标题文字..."
        />
        <style>{`[data-placeholder]:empty::before { content: attr(data-placeholder); color: rgba(255,255,255,0.2); pointer-events: none; }`}</style>
        <p className="text-[10px] text-white/25 mt-1.5">选中文字后点加粗/颜色按钮来单独设置样式</p>
      </GlassCard>

      {/* Alignment */}
      <GlassCard className="p-4">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">对齐方式</h3>
        <div className="flex gap-2">
          {([
            { value: 'left', icon: AlignLeft, label: '靠左' },
            { value: 'center', icon: AlignCenter, label: '居中' },
            { value: 'right', icon: AlignRight, label: '靠右' },
          ] as const).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => updateTitle({ textAlign: value })}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs transition-all duration-150',
                title.textAlign === value
                  ? 'border-blue-400/50 bg-blue-500/15 text-blue-200'
                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Global style */}
      <GlassCard className="p-4">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">全局样式</h3>
        <div className="space-y-3">
          <Select
            label="字体"
            value={title.fontFamily}
            options={FONT_OPTIONS}
            onChange={v => updateTitle({ fontFamily: v as any })}
          />
          <Slider
            label="字号"
            value={title.fontSize}
            min={16}
            max={96}
            onChange={v => updateTitle({ fontSize: v })}
            formatValue={v => `${v}px`}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">全局加粗</span>
            <button
              onClick={() => updateTitle({ bold: !title.bold })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs transition-all duration-150',
                title.bold
                  ? 'bg-blue-500/20 border-blue-400/40 text-blue-200'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
              )}
            >
              <Bold className="w-3 h-3" />
              {title.bold ? '已加粗' : '加粗'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">全局颜色</span>
            <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/20">
              <div className="absolute inset-0" style={{ background: title.color }} />
              <input
                type="color"
                value={title.color}
                onChange={e => updateTitle({ color: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Position */}
      <GlassCard className="p-4">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">位置</h3>
        <div className="space-y-3">
          <Slider
            label="水平"
            value={title.position.x}
            min={0}
            max={100}
            onChange={v => updateTitle({ position: { ...title.position, x: v } })}
            formatValue={v => `${v}%`}
          />
          <Slider
            label="垂直"
            value={title.position.y}
            min={0}
            max={100}
            onChange={v => updateTitle({ position: { ...title.position, y: v } })}
            formatValue={v => `${v}%`}
          />
        </div>
      </GlassCard>

      {/* Preview */}
      {plainText.trim() && (
        <GlassCard className="p-4">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-2">样式预览</h3>
          <div className="bg-black/40 rounded-xl p-4" style={{ textAlign: title.textAlign }}>
            <span
              dangerouslySetInnerHTML={{ __html: spansToHtml(title.spans).replace(/\n/g, '<br>') }}
              style={{
                fontFamily: `${title.fontFamily}, serif`,
                fontSize: Math.min(title.fontSize * 0.35, 20) + 'px',
                fontWeight: title.bold ? 'bold' : 'normal',
                color: title.color,
                lineHeight: '1.5',
              }}
            />
          </div>
        </GlassCard>
      )}
    </div>
  )
}
