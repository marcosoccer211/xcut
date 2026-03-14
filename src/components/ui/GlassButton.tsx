import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface GlassButtonProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  title?: string
}

export function GlassButton({ children, className, onClick, variant = 'default', size = 'md', disabled, title }: GlassButtonProps) {
  const variants = {
    default: 'bg-white/[0.08] border-white/15 hover:bg-white/15 hover:border-white/25 text-white/90',
    primary: 'bg-blue-500/20 border-blue-400/30 hover:bg-blue-500/30 hover:border-blue-400/50 text-blue-100',
    danger: 'bg-red-500/15 border-red-400/25 hover:bg-red-500/25 text-red-200',
    ghost: 'bg-transparent border-transparent hover:bg-white/[0.08] text-white/70 hover:text-white',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2 text-sm rounded-xl',
    lg: 'px-6 py-3 text-base rounded-xl',
  }

  return (
    <motion.button
      title={title}
      disabled={disabled}
      onClick={onClick}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 border backdrop-blur-sm font-medium',
        'transition-all duration-150 select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </motion.button>
  )
}
