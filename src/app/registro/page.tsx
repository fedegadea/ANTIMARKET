'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function RegistroMarcaPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre: '', descripcion: '', instagram: '', sitio_web: '',
    categorias: '', logo_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const slug = slugify(form.nombre) + '-' + Math.random().toString(36).slice(2, 6)

    // Crear marca
    const { data: brand, error: brandErr } = await supabase.from('brands').insert({
      user_id: user.id,
      nombre: form.nombre,
      slug,
      descripcion: form.descripcion || null,
      instagram: form.instagram || null,
      sitio_web: form.sitio_web || null,
      logo_url: form.logo_url || null,
      categorias: form.categorias ? form.categorias.split(',').map(s => s.trim()).filter(Boolean) : [],
      estado_verificacion: 'pendiente',
      suscripcion_estado: 'trial',
    }).select().single()

    if (brandErr) { setError(brandErr.message); setSaving(false); return }

    // Crear verification request automática
    await supabase.from('verification_requests').insert({ brand_id: brand.id })

    // Actualizar rol del usuario a 'marca'
    await supabase.from('profiles').update({ rol: 'marca' }).eq('id', user.id)

    router.push('/panel')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        <p className="text-xs text-white/30 uppercase tracking-[0.2em] mb-2">Anti Market</p>
        <h1 className="text-3xl font-black tracking-tight mb-2">Registrá tu marca</h1>
        <p className="text-sm text-white/40 mb-10">
          Completá tu perfil para que el equipo pueda verificarla. Una vez aprobada, podés publicar productos.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {[
            { key: 'nombre', label: 'Nombre de la marca *', type: 'text', ph: 'Ej: Studio Noir' },
            { key: 'instagram', label: 'Instagram', type: 'text', ph: '@tumarca' },
            { key: 'sitio_web', label: 'Sitio web', type: 'url', ph: 'https://...' },
            { key: 'logo_url', label: 'URL del logo', type: 'url', ph: 'https://... (imagen cuadrada)' },
            { key: 'categorias', label: 'Categorías (separadas por coma)', type: 'text', ph: 'Ropa, Accesorios, Lifestyle' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.ph}
                required={f.key === 'nombre'}
                className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Descripción *</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
              required rows={4} placeholder="Contá qué es tu marca, qué vendés, por qué es especial..."
              className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button type="submit" loading={saving} size="lg" className="w-full mt-2">
            Enviar para verificación →
          </Button>
        </form>
      </div>
    </div>
  )
}
