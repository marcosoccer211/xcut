import { create } from 'zustand'
import type { ProjectState, HistoryEntry, SubtitleConfig, TitleConfig, BackgroundConfig, SubtitleSegment, VideoClip } from '@/types'
import { generateId } from '@/lib/utils'

const defaultSubtitleStyle = {
  fontFamily: 'Inter' as const,
  fontSize: 22,
  bold: false,
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.6)',
  shadowEnabled: true,
  preset: 'netflix' as const,
}

const defaultState: ProjectState = {
  videoFile: null,
  videoUrl: null,
  clips: [],
  subtitle: {
    segments: [],
    layout: 'single-en',
    enStyle: defaultSubtitleStyle,
    zhStyle: { ...defaultSubtitleStyle, fontFamily: 'Noto Serif SC' },
    enPosition: { x: 50, y: 88 },
    zhPosition: { x: 50, y: 93 },
  },
  title: {
    spans: [{ text: '' }],
    fontFamily: 'Cormorant Garamond',
    fontSize: 36,
    bold: false,
    color: '#ffffff',
    textAlign: 'center' as const,
    position: { x: 50, y: 10 },
    visible: false,
  },
  background: {
    aspectRatio: '16:9',
    blurLevel: 2,
    blurColor: 'rgba(0,0,0,0.3)',
  },
  isProcessing: false,
  processingProgress: 0,
  processingStatus: '',
}

interface Store extends ProjectState {
  past: HistoryEntry[]
  future: HistoryEntry[]
  canUndo: boolean
  canRedo: boolean
  setVideo: (file: File, url: string) => void
  updateSubtitle: (subtitle: Partial<SubtitleConfig>) => void
  updateTitle: (title: Partial<TitleConfig>) => void
  updateBackground: (bg: Partial<BackgroundConfig>) => void
  setSegments: (segments: SubtitleSegment[]) => void
  setProcessing: (isProcessing: boolean, progress?: number, status?: string) => void
  initClips: (duration: number) => void
  splitClip: (time: number) => void
  deleteClip: (id: string) => void
  trimClip: (id: string, start: number, end: number) => void
  undo: () => void
  redo: () => void
  pushHistory: () => void
}

export const useProjectStore = create<Store>((set, get) => ({
  ...defaultState,
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  setVideo: (file, url) => set({ videoFile: file, videoUrl: url, clips: [] }),

  initClips: (duration) => set({ clips: [{ id: generateId(), start: 0, end: duration }] }),

  splitClip: (time) => set((s) => {
    const idx = s.clips.findIndex(c => time > c.start && time < c.end)
    if (idx === -1) return s
    const clip = s.clips[idx]
    if (time - clip.start < 0.1 || clip.end - time < 0.1) return s
    const newClips = [...s.clips]
    newClips.splice(idx, 1,
      { id: generateId(), start: clip.start, end: time },
      { id: generateId(), start: time, end: clip.end },
    )
    return { clips: newClips }
  }),

  deleteClip: (id) => set((s) => {
    if (s.clips.length <= 1) return s
    return { clips: s.clips.filter(c => c.id !== id) }
  }),

  trimClip: (id, start, end) => set((s) => {
    const idx = s.clips.findIndex(c => c.id === id)
    if (idx === -1) return s
    const clip = s.clips[idx]
    const prevEnd = idx > 0 ? s.clips[idx - 1].end : 0
    const nextStart = idx < s.clips.length - 1 ? s.clips[idx + 1].start : Infinity
    const clampedStart = Math.max(prevEnd, Math.min(start, clip.end - 0.1))
    const clampedEnd = Math.min(nextStart, Math.max(end, clip.start + 0.1))
    const newClips = [...s.clips]
    newClips[idx] = { ...clip, start: clampedStart, end: clampedEnd }
    return { clips: newClips }
  }),

  pushHistory: () => {
    const { subtitle, title, background, past } = get()
    const entry: HistoryEntry = {
      subtitle: JSON.parse(JSON.stringify(subtitle)),
      title: JSON.parse(JSON.stringify(title)),
      background: JSON.parse(JSON.stringify(background)),
    }
    const newPast = [...past, entry].slice(-50)
    set({ past: newPast, future: [], canUndo: true, canRedo: false })
  },

  updateSubtitle: (update) => {
    get().pushHistory()
    set((s) => ({ subtitle: { ...s.subtitle, ...update } }))
  },

  updateTitle: (update) => {
    get().pushHistory()
    set((s) => ({ title: { ...s.title, ...update } }))
  },

  updateBackground: (update) => {
    get().pushHistory()
    set((s) => ({ background: { ...s.background, ...update } }))
  },

  setSegments: (segments) => {
    set((s) => ({ subtitle: { ...s.subtitle, segments } }))
  },

  setProcessing: (isProcessing, progress = 0, status = '') =>
    set({ isProcessing, processingProgress: progress, processingStatus: status }),

  undo: () => {
    const { past, subtitle, title, background, future } = get()
    if (past.length === 0) return
    const prev = past[past.length - 1]
    const newPast = past.slice(0, -1)
    const current: HistoryEntry = {
      subtitle: JSON.parse(JSON.stringify(subtitle)),
      title: JSON.parse(JSON.stringify(title)),
      background: JSON.parse(JSON.stringify(background)),
    }
    set({
      past: newPast,
      future: [current, ...future].slice(0, 50),
      subtitle: prev.subtitle,
      title: prev.title,
      background: prev.background,
      canUndo: newPast.length > 0,
      canRedo: true,
    })
  },

  redo: () => {
    const { past, subtitle, title, background, future } = get()
    if (future.length === 0) return
    const next = future[0]
    const newFuture = future.slice(1)
    const current: HistoryEntry = {
      subtitle: JSON.parse(JSON.stringify(subtitle)),
      title: JSON.parse(JSON.stringify(title)),
      background: JSON.parse(JSON.stringify(background)),
    }
    set({
      past: [...past, current].slice(-50),
      future: newFuture,
      subtitle: next.subtitle,
      title: next.title,
      background: next.background,
      canUndo: true,
      canRedo: newFuture.length > 0,
    })
  },
}))
