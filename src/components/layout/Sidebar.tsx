import { motion } from 'framer-motion'
import { Captions, Type, ImageIcon, Video, Undo2, Redo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/projectStore'

export type PanelTab = 'subtitle' | 'title' | 'background' | 'recording'

interface SidebarProps {
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
}

const tabs = [
  { id: 'subtitle' as PanelTab, icon: Captions, label: '字幕' },
  { id: 'title' as PanelTab, icon: Type, label: '标题' },
  { id: 'background' as PanelTab, icon: ImageIcon, label: '背景' },
  { id: 'recording' as PanelTab, icon: Video, label: '录屏' },
]

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { undo, redo, canUndo, canRedo } = useProjectStore()

  return (
    <div className="w-16 flex flex-col items-center py-6 gap-3 border-r border-white/[0.08] bg-black/20">
      <div className="mb-4">
        <span
          className="text-xs font-bold text-white/80 tracking-widest"
          style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '11px', letterSpacing: '0.15em' }}
        >
          XCUT
        </span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <motion.button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title={tab.label}
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
                'border backdrop-blur-sm',
                isActive
                  ? 'bg-blue-500/20 border-blue-400/40 shadow-[0_0_12px_rgba(96,165,250,0.3)] text-blue-300'
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
              )}
            >
              <Icon className="w-4 h-4" />
            </motion.button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        <motion.button
          onClick={undo}
          disabled={!canUndo}
          whileHover={canUndo ? { scale: 1.05 } : undefined}
          whileTap={canUndo ? { scale: 0.95 } : undefined}
          title="撤销 (Ctrl+Z)"
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
            'border backdrop-blur-sm',
            canUndo
              ? 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
              : 'bg-white/[0.03] border-white/5 text-white/20 cursor-not-allowed'
          )}
        >
          <Undo2 className="w-4 h-4" />
        </motion.button>
        <motion.button
          onClick={redo}
          disabled={!canRedo}
          whileHover={canRedo ? { scale: 1.05 } : undefined}
          whileTap={canRedo ? { scale: 0.95 } : undefined}
          title="重做 (Ctrl+Shift+Z)"
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
            'border backdrop-blur-sm',
            canRedo
              ? 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
              : 'bg-white/[0.03] border-white/5 text-white/20 cursor-not-allowed'
          )}
        >
          <Redo2 className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  )
}
