import { useProjectStore } from '@/stores/projectStore'
import { GlassCard } from '@/components/ui/GlassCard'
import { Slider } from '@/components/ui/Slider'
import { cn } from '@/lib/utils'

const RATIOS = [
  { value: '16:9', label: '16:9', w: 16, h: 9, desc: '横屏' },
  { value: '9:16', label: '9:16', w: 9, h: 16, desc: '竖屏' },
  { value: '1:1', label: '1:1', w: 1, h: 1, desc: '方形' },
  { value: '4:3', label: '4:3', w: 4, h: 3, desc: '传统' },
  { value: '21:9', label: '21:9', w: 21, h: 9, desc: '超宽' },
]

const BLUR_LABELS = ['无', '轻微', '中等', '强烈', '极强']

export function BackgroundPanel() {
  const { background, updateBackground } = useProjectStore()

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-1 pb-4">
      <GlassCard className="p-4">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">视频比例</h3>
        <div className="grid grid-cols-3 gap-2">
          {RATIOS.map(r => {
            const isActive = background.aspectRatio === r.value
            const maxDim = 28
            const rw = r.w >= r.h ? maxDim : Math.round((r.w / r.h) * maxDim)
            const rh = r.h >= r.w ? maxDim : Math.round((r.h / r.w) * maxDim)
            return (
              <button
                key={r.value}
                onClick={() => updateBackground({ aspectRatio: r.value as any })}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-150',
                  isActive
                    ? 'border-blue-400/50 bg-blue-500/15 text-blue-200'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/8 hover:text-white/70'
                )}
              >
                <div
                  className={cn('border-2 rounded-sm', isActive ? 'border-blue-400/70' : 'border-white/30')}
                  style={{ width: rw, height: rh }}
                />
                <span className="text-xs font-medium">{r.label}</span>
                <span className="text-[10px] opacity-60">{r.desc}</span>
              </button>
            )
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">背景模糊</h3>
        <p className="text-xs text-white/30 mb-4">黑边区域用模糊视频帧填充</p>
        <Slider
          label="模糊程度"
          value={background.blurLevel}
          min={0}
          max={4}
          step={1}
          onChange={v => updateBackground({ blurLevel: v as any })}
          formatValue={v => BLUR_LABELS[v]}
        />
        <div className="flex justify-between mt-2">
          {BLUR_LABELS.map((label, i) => (
            <span
              key={i}
              className={cn('text-[9px]', background.blurLevel === i ? 'text-blue-300' : 'text-white/20')}
            >
              {label}
            </span>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
