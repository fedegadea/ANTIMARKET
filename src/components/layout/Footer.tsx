import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-white/8 mt-24">
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <p className="text-base font-black tracking-[-0.05em] uppercase mb-1">Anti Market</p>
          <p className="text-xs text-white/30">Marcas reales. Venta directa. Sin intermediarios.</p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-white/30">
          <Link href="/" className="hover:text-white transition-colors">Marcas</Link>
          <Link href="/auth/signup?rol=marca" className="hover:text-white transition-colors">Ser parte</Link>
          <Link href="/auth/login" className="hover:text-white transition-colors">Ingresar</Link>
        </nav>
        <p className="text-xs text-white/20">© {new Date().getFullYear()} Anti Market</p>
      </div>
    </footer>
  )
}
