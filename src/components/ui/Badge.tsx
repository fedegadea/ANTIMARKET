interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'outline'
  className?: string
}

const variants = {
  default:  'bg-white/10 text-white/70',
  success:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  warning:  'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  danger:   'bg-red-500/15 text-red-400 border border-red-500/20',
  outline:  'border border-white/20 text-white/70',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase rounded-sm ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
