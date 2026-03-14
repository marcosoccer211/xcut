import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function GlassCard({ children, className, hover = false, onClick }: GlassCardProps) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={hover ? { scale: 1.01, y: -1 } : undefined}
      className={cn(
        'rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl',
        'shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]',
        hover && 'cursor-pointer transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08]',
        className
      )}
    >
      {children}
    </motion.div>
  )
}
