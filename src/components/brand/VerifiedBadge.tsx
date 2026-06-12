export function VerifiedBadge({ small }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium tracking-widest uppercase border border-white/30 text-white ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'}`}>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 4L3 5.5L6.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Verificada
    </span>
  )
}
