import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'

export async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
    profile = data
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/8 bg-black/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-base font-black tracking-[-0.05em] uppercase hover:opacity-70 transition-opacity">
          Anti Market
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/50">
          <Link href="/" className="hover:text-white transition-colors">Marcas</Link>
          <Link href="/?tab=productos" className="hover:text-white transition-colors">Productos</Link>
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {profile?.rol === 'admin' && (
                <Link href="/admin" className="text-xs text-white/40 hover:text-white transition-colors">Admin</Link>
              )}
              {profile?.rol === 'marca' && (
                <Link href="/panel" className="text-xs text-white/40 hover:text-white transition-colors">Mi panel</Link>
              )}
              <form action="/auth/signout" method="post">
                <button className="text-xs text-white/30 hover:text-white transition-colors">Salir</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost" size="sm">Ingresar</Button>
              </Link>
              <Link href="/auth/signup">
                <Button size="sm">Registrarse</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
