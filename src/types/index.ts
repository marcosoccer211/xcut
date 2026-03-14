export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9'
export type BilingualLayout = 'en-top' | 'zh-top' | 'single-en' | 'single-zh' | 'none'
export type SubtitlePosition = { x: number; y: number } // percentage 0-100
export type TitlePosition = { x: number; y: number }
export type BlurLevel = 0 | 1 | 2 | 3 | 4 // 0=none, 4=heavy
export type FontFamily = 'Inter' | 'Cormorant Garamond' | 'Noto Serif SC' | 'Plus Jakarta Sans'

export interface SubtitleSegment {
  id: string
  startTime: number // seconds
  endTime: number
  textEn: string
  textZh: string
}

export interface SubtitleStyle {
  fontFamily: FontFamily
  fontSize: number // px
  bold: boolean
  color: string
  backgroundColor: string // rgba
  shadowEnabled: boolean
  preset: 'netflix' | 'plain' | 'outline' | 'karaoke'
}

export interface TitleSpan {
  text: string       // may contain '\n' for line breaks
  bold?: boolean
  color?: string     // undefined = inherit title default color
}

export interface TitleConfig {
  spans: TitleSpan[] // rich text spans
  fontFamily: FontFamily
  fontSize: number
  bold: boolean      // global default
  color: string      // global default
  textAlign: 'left' | 'center' | 'right'
  position: TitlePosition
  visible: boolean
}

export interface BackgroundConfig {
  aspectRatio: AspectRatio
  blurLevel: BlurLevel
  blurColor: string
}

export interface SubtitleConfig {
  segments: SubtitleSegment[]
  layout: BilingualLayout
  enStyle: SubtitleStyle
  zhStyle: SubtitleStyle
  enPosition: SubtitlePosition
  zhPosition: SubtitlePosition
}

export interface VideoClip {
  id: string
  start: number  // seconds
  end: number    // seconds
}

export interface ProjectState {
  videoFile: File | null
  videoUrl: string | null
  subtitle: SubtitleConfig
  title: TitleConfig
  background: BackgroundConfig
  clips: VideoClip[]
  isProcessing: boolean
  processingProgress: number
  processingStatus: string
}

export type HistoryEntry = {
  subtitle: SubtitleConfig
  title: TitleConfig
  background: BackgroundConfig
}
