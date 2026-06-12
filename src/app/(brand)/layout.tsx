import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function BrandLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('rol,nombre').eq('id', user.id).single()
  if (profile?.rol === 'admin') redirect('/admin')

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-white/8 bg-black">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-black tracking-[-0.04em] uppercase text-white/40 hover:text-white transition-colors">Anti Market</Link>
            <span className="text-white/10">/</span>
            <span className="text-sm text-white/60">Panel de marca</span>
          </div>
          <nav className="flex items-center gap-6 text-xs text-white/40">
            <Link href="/panel" className="hover:text-white transition-colors">Dashboard</Link>
            <Link href="/panel/productos" className="hover:text-white transition-colors">Productos</Link>
            <Link href="/panel/ordenes" className="hover:text-white transition-colors">Órdenes</Link>
            <form action="/auth/signout" method="post">
              <button className="hover:text-white transition-colors">Salir</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
