'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

const BUCKET = 'brand-assets'

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function RegistroMarcaPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre: '', descripcion: '', instagram: '', sitio_web: '', categorias: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const logoRef = useRef<HTMLInputElement>(null)

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 4 * 1024 * 1024) { setError('El logo no puede superar 4MB.'); return }
    setLogoFile(f)
    setLogoPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const slug = slugify(form.nombre) + '-' + Math.random().toString(36).slice(2, 6)

    // Crear marca primero (sin logo para tener el id)
    const { data: brand, error: brandErr } = await supabase.from('brands').insert({
      user_id: user.id,
      nombre: form.nombre,
      slug,
      descripcion: form.descripcion || null,
      instagram: form.instagram || null,
      sitio_web: form.sitio_web || null,
      categorias: form.categorias ? form.categorias.split(',').map(s => s.trim()).filter(Boolean) : [],
      estado_verificacion: 'pendiente',
      suscripcion_estado: 'trial',
    }).select().single()

    if (brandErr) { setError(brandErr.message); setSaving(false); return }

    // Subir logo si hay
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `${brand.id}/logo.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, logoFile, { upsert: true })
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
        await supabase.from('brands').update({ logo_url: publicUrl }).eq('id', brand.id)
      }
    }

    await supabase.from('verification_requests').insert({ brand_id: brand.id })
    await supabase.from('profiles').update({ rol: 'marca' }).eq('id', user.id)

    router.push('/panel')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        <p className="text-xs text-white/30 uppercase tracking-[0.2em] mb-2">Anti Market</p>
        <h1 className="text-3xl font-black tracking-tight mb-2">Registrá tu marca</h1>
        <p className="text-sm text-white/40 mb-10">
          Completá tu perfil para que el equipo pueda verificarla. Una vez aprobada, armás tu local.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Logo */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Logo (opcional)</p>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 border border-white/10 flex items-center justify-center cursor-pointer overflow-hidden hover:border-white/30 transition-colors"
                style={{ background: '#0a0a0a' }}
                onClick={() => logoRef.current?.click()}
              >
                {logoPreview
                  ? <img src={logoPreview} alt="logo" className="w-full h-full object-contain" />
                  : <span className="text-white/20 text-xl">＋</span>
                }
              </div>
              <div>
                <Button type="button" variant="secondary" size="sm" onClick={() => logoRef.current?.click()}>
                  {logoPreview ? 'Cambiar logo' : 'Subir logo'}
                </Button>
                <p className="text-xs text-white/20 mt-1">JPG, PNG · máx 4MB</p>
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Nombre de la marca *</label>
            <input
              type="text" value={form.nombre} placeholder="Ej: Studio Noir"
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              required
              className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Descripción *</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              required rows={4} placeholder="Contá qué es tu marca, qué vendés, por qué es especial..."
              className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors resize-none"
            />
          </div>

          {[
            { key: 'instagram', label: 'Instagram', ph: '@tumarca' },
            { key: 'sitio_web', label: 'Sitio web', ph: 'https://...' },
            { key: 'categorias', label: 'Categorías (separadas por coma)', ph: 'Ropa, Accesorios, Lifestyle' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">{f.label}</label>
              <input
                type="text" value={(form as any)[f.key]} placeholder={f.ph}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
              />
            </div>
          ))}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button type="submit" loading={saving} size="lg" className="w-full mt-2">
            Enviar para verificación →
          </Button>
        </form>
      </div>
    </div>
  )
}
