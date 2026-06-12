'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center text-xl font-black tracking-[-0.05em] uppercase mb-12 text-white/60 hover:text-white transition-colors">
          Anti Market
        </Link>

        <h1 className="text-2xl font-black tracking-tight mb-8">Ingresar</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Email</label>
            <input
              type="email" required autoFocus value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Contraseña</label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
            Ingresar
          </Button>
        </form>

        <p className="mt-8 text-center text-xs text-white/30">
          ¿No tenés cuenta?{' '}
          <Link href="/auth/signup" className="text-white hover:underline">Registrarse</Link>
        </p>
      </div>
    </div>
  )
}
