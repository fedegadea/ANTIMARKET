'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rolParam = searchParams.get('rol') as 'comprador' | 'marca' | null

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<'comprador' | 'marca'>(rolParam === 'marca' ? 'marca' : 'comprador')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nombre, rol } },
    })
    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
  }

  if (done) return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-4xl mb-6">✓</p>
        <h2 className="text-xl font-black mb-3">Revisá tu email</h2>
        <p className="text-sm text-white/40">Te enviamos un link de confirmación a <strong className="text-white">{email}</strong>.</p>
        <Link href="/" className="mt-8 inline-block text-xs text-white/30 hover:text-white transition-colors">← Volver al inicio</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center text-xl font-black tracking-[-0.05em] uppercase mb-12 text-white/60 hover:text-white transition-colors">
          Anti Market
        </Link>

        <h1 className="text-2xl font-black tracking-tight mb-2">Crear cuenta</h1>
        <p className="text-sm text-white/40 mb-8">
          {rol === 'marca' ? 'Como marca — podrás solicitar tu verificación.' : 'Como comprador — navegá y comprá directo.'}
        </p>

        {/* Selector de rol */}
        <div className="flex border border-white/10 mb-6">
          {(['comprador', 'marca'] as const).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRol(r)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors ${rol === r ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
            >
              {r === 'comprador' ? 'Comprador' : 'Soy una marca'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {[
            { key: 'nombre', label: 'Nombre', type: 'text', value: nombre, set: setNombre, ph: rol === 'marca' ? 'Nombre de tu marca' : 'Tu nombre' },
            { key: 'email', label: 'Email', type: 'email', value: email, set: setEmail, ph: 'tu@email.com' },
            { key: 'password', label: 'Contraseña', type: 'password', value: password, set: setPassword, ph: '8+ caracteres' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">{f.label}</label>
              <input
                type={f.type} required value={f.value}
                onChange={e => f.set(e.target.value)}
                placeholder={f.ph}
                minLength={f.key === 'password' ? 8 : undefined}
                className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
              />
            </div>
          ))}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
            {rol === 'marca' ? 'Registrar marca' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="mt-8 text-center text-xs text-white/30">
          ¿Ya tenés cuenta?{' '}
          <Link href="/auth/login" className="text-white hover:underline">Ingresar</Link>
        </p>
      </div>
    </div>
  )
}
