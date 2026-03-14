import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from '@/components/layout/Sidebar'
import type { PanelTab } from '@/components/layout/Sidebar'
import { SubtitlePanel } from '@/components/panels/SubtitlePanel'
import { TitlePanel } from '@/components/panels/TitlePanel'
import { BackgroundPanel } from '@/components/panels/BackgroundPanel'
import { RecordingPanel } from '@/components/panels/RecordingPanel'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { ExportButton } from '@/components/export/ExportButton'
import { useProjectStore } from '@/stores/projectStore'

const PANEL_LABELS: Record<PanelTab, string> = {
  subtitle: '字幕设置',
  title: '标题设置',
  background: '背景设置',
  recording: '录屏',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<PanelTab>('subtitle')
  const { undo, redo } = useProjectStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault()
        redo()
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  const panels: Record<PanelTab, React.ReactNode> = {
    subtitle: <SubtitlePanel />,
    title: <TitlePanel />,
    background: <BackgroundPanel />,
    recording: <RecordingPanel onDone={() => setActiveTab('subtitle')} />,
  }

  return (
    <div className="h-screen flex flex-col bg-[#08080f] overflow-hidden">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-white/[0.06] bg-black/30 backdrop-blur-xl shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-base font-semibold text-white/90 tracking-[0.12em]"
            style={{ fontFamily: 'Cormorant Garamond, serif' }}
          >
            XCut
          </span>
          <span className="text-[11px] text-white/20 tracking-wider">AI VIDEO STUDIO</span>
        </div>
        <ExportButton />
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Panel */}
        <div className="w-72 border-r border-white/[0.06] bg-black/10 overflow-hidden flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
            <h2 className="text-[11px] font-semibold text-white/35 uppercase tracking-[0.15em]">
              {PANEL_LABELS[activeTab]}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.12 }}
              >
                {panels[activeTab]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 p-4 overflow-hidden flex flex-col min-w-0">
          <VideoPreview />
        </div>
      </div>
    </div>
  )
}
