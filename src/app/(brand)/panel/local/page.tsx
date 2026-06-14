'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import type { Brand } from '@/lib/types'

const BUCKET = 'brand-assets'

export default function LocalPage() {
  const [brand, setBrand] = useState<Brand | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    descripcion: '', instagram: '', sitio_web: '', color_acento: '#ffffff', categorias: '',
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [pendingLogo, setPendingLogo] = useState<File | null>(null)
  const [pendingBanner, setPendingBanner] = useState<File | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: b } = await supabase.from('brands').select('*').eq('user_id', user.id).single()
      if (!b) return
      setBrand(b as Brand)
      setForm({
        descripcion: b.descripcion ?? '',
        instagram: b.instagram ?? '',
        sitio_web: b.sitio_web ?? '',
        color_acento: b.color_acento ?? '#ffffff',
        categorias: (b.categorias ?? []).join(', '),
      })
      if (b.logo_url) setLogoPreview(b.logo_url)
      if (b.banner_url) setBannerPreview(b.banner_url)
    }
    load()
  }, [])

  function pickFile(input: HTMLInputElement | null, maxMb: number, onFile: (f: File) => void) {
    if (!input) return
    input.onchange = (e: any) => {
      const f: File = e.target.files[0]
      if (!f) return
      if (f.size > maxMb * 1024 * 1024) { setMsg(`El archivo no puede superar ${maxMb}MB.`); return }
      onFile(f)
    }
    input.click()
  }

  function handleLogoFile(f: File) {
    setPendingLogo(f)
    setLogoPreview(URL.createObjectURL(f))
  }

  function handleBannerFile(f: File) {
    setPendingBanner(f)
    setBannerPreview(URL.createObjectURL(f))
  }

  async function uploadToStorage(file: File, path: string): Promise<string | null> {
    const supabase = createClient()
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) { setMsg('Error al subir imagen: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return publicUrl
  }

  async function save() {
    if (!brand) return
    setSaving(true); setMsg('')
    const supabase = createClient()

    const updates: Record<string, any> = {
      descripcion: form.descripcion || null,
      instagram: form.instagram || null,
      sitio_web: form.sitio_web || null,
      color_acento: form.color_acento,
      categorias: form.categorias ? form.categorias.split(',').map(s => s.trim()).filter(Boolean) : [],
    }

    if (pendingLogo) {
      const ext = pendingLogo.name.split('.').pop()
      const url = await uploadToStorage(pendingLogo, `${brand.id}/logo.${ext}`)
      if (!url) { setSaving(false); return }
      updates.logo_url = url
      setPendingLogo(null)
    }

    if (pendingBanner) {
      const ext = pendingBanner.name.split('.').pop()
      const url = await uploadToStorage(pendingBanner, `${brand.id}/banner.${ext}`)
      if (!url) { setSaving(false); return }
      updates.banner_url = url
      setPendingBanner(null)
    }

    const { error } = await supabase.from('brands').update(updates).eq('id', brand.id)
    if (error) { setMsg('Error: ' + error.message) }
    else { setMsg('✓ Local guardado.'); setTimeout(() => setMsg(''), 3000) }
    setSaving(false)
  }

  if (!brand) return <p className="text-white/20 text-sm">Cargando...</p>

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-2">Mi local</h1>
      <p className="text-sm text-white/40 mb-10">Decorá tu espacio en Anti Market: banner, logo, colores e info de contacto.</p>

      {/* Banner */}
      <div className="mb-8">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Banner / portada</p>
        <div
          className="relative w-full h-40 border border-white/8 overflow-hidden cursor-pointer group"
          style={{ background: bannerPreview ? undefined : '#0a0a0a' }}
          onClick={() => pickFile(bannerRef.current, 8, handleBannerFile)}
        >
          {bannerPreview
            ? <img src={bannerPreview} alt="banner" className="w-full h-full object-contain" />
            : <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20 group-hover:text-white/40 transition-colors">
                <span className="text-2xl">＋</span>
                <span className="text-xs">Subir banner (archivo)</span>
              </div>
          }
          {bannerPreview && (
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-xs text-white">Cambiar imagen</span>
            </div>
          )}
        </div>
        <input ref={bannerRef} type="file" accept="image/*" className="hidden" />
        <p className="text-xs text-white/20 mt-2">JPG, PNG, WEBP · máx 8MB · se muestra completa, sin recorte</p>
      </div>

      {/* Logo */}
      <div className="mb-8">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Logo</p>
        <div className="flex items-center gap-5">
          <div
            className="w-20 h-20 border border-white/8 overflow-hidden cursor-pointer group relative flex items-center justify-center"
            style={{ background: '#0a0a0a' }}
            onClick={() => pickFile(logoRef.current, 4, handleLogoFile)}
          >
            {logoPreview
              ? <img src={logoPreview} alt="logo" className="w-full h-full object-contain" />
              : <span className="text-white/20 text-xl group-hover:text-white/40 transition-colors">＋</span>
            }
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => pickFile(logoRef.current, 4, handleLogoFile)}>
              {logoPreview ? 'Cambiar logo' : 'Subir logo'}
            </Button>
            <p className="text-xs text-white/20 mt-1.5">JPG, PNG, WEBP · máx 4MB · imagen cuadrada ideal</p>
          </div>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" />
        </div>
      </div>

      {/* Color acento */}
      <div className="mb-8">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Color de acento</p>
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={form.color_acento}
            onChange={e => setForm(p => ({ ...p, color_acento: e.target.value }))}
            className="w-12 h-12 border border-white/10 cursor-pointer bg-transparent rounded"
          />
          <span className="text-sm font-mono text-white/50">{form.color_acento}</span>
        </div>
        <p className="text-xs text-white/20 mt-2">Se usa como tinte sutil en tu local. El diseño general del sistema siempre prevalece.</p>
      </div>

      {/* Descripción */}
      <div className="mb-6">
        <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Descripción de la marca</label>
        <textarea
          value={form.descripcion}
          onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
          rows={4} placeholder="Contá qué es tu marca, qué la hace especial..."
          className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors resize-none"
        />
      </div>

      {/* Contacto */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {[
          { key: 'instagram', label: 'Instagram', ph: '@tumarca' },
          { key: 'sitio_web', label: 'Sitio web', ph: 'https://...' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">{f.label}</label>
            <input
              type="text"
              value={(form as any)[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.ph}
              className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
            />
          </div>
        ))}
        <div className="md:col-span-2">
          <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Categorías (separadas por coma)</label>
          <input
            type="text"
            value={form.categorias}
            onChange={e => setForm(p => ({ ...p, categorias: e.target.value }))}
            placeholder="Ropa, Accesorios, Lifestyle"
            className="w-full border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
          />
        </div>
      </div>

      {msg && <p className={`text-xs mb-4 ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</p>}
      <Button loading={saving} onClick={save} size="lg">Guardar local</Button>
    </div>
  )
}
