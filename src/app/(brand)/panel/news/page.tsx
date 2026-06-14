'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { News, Brand } from '@/lib/types'

const BUCKET = 'brand-assets'

type NewsForm = { titulo: string; contenido: string }
const empty: NewsForm = { titulo: '', contenido: '' }

export default function NewsPanel() {
  const [brand, setBrand] = useState<Brand | null>(null)
  const [newsList, setNewsList] = useState<News[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewsForm>(empty)
  const [editId, setEditId] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: b } = await supabase.from('brands').select('*').eq('user_id', user.id).single()
    setBrand(b as Brand)
    if (b) {
      const { data: n } = await supabase.from('news').select('*').eq('brand_id', b.id).order('created_at', { ascending: false })
      setNewsList(n as News[] ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm(empty); setEditId(null); setImagePreview(null); setPendingImage(null)
    setShowForm(true)
  }

  function openEdit(n: News) {
    setForm({ titulo: n.titulo, contenido: n.contenido ?? '' })
    setEditId(n.id)
    setImagePreview(n.imagen_url)
    setPendingImage(null)
    setShowForm(true)
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 6 * 1024 * 1024) { setMsg('La imagen no puede superar 6MB.'); return }
    setPendingImage(f)
    setImagePreview(URL.createObjectURL(f))
  }

  async function save() {
    if (!brand || !form.titulo) return
    setSaving(true); setMsg('')
    const supabase = createClient()

    let imagen_url: string | null = imagePreview && !pendingImage ? imagePreview : null

    if (pendingImage) {
      const ext = pendingImage.name.split('.').pop()
      const path = `${brand.id}/news/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pendingImage, { upsert: true })
      if (upErr) { setMsg('Error al subir imagen: ' + upErr.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
      imagen_url = publicUrl
    }

    const payload = {
      brand_id: brand.id,
      titulo: form.titulo,
      contenido: form.contenido || null,
      imagen_url,
      activa: true,
    }

    if (editId) {
      await supabase.from('news').update(payload).eq('id', editId)
    } else {
      await supabase.from('news').insert(payload)
    }

    setShowForm(false); setForm(empty); setEditId(null); setImagePreview(null); setPendingImage(null)
    await load()
    setSaving(false)
  }

  async function toggleActiva(n: News) {
    const supabase = createClient()
    await supabase.from('news').update({ activa: !n.activa }).eq('id', n.id)
    setNewsList(prev => prev.map(x => x.id === n.id ? { ...x, activa: !x.activa } : x))
  }

  async function deleteNews(id: string) {
    if (!confirm('¿Eliminar esta novedad?')) return
    const supabase = createClient()
    await supabase.from('news').delete().eq('id', id)
    setNewsList(prev => prev.filter(x => x.id !== id))
  }

  if (loading) return <p className="text-white/20 text-sm">Cargando...</p>
  if (!brand) return <p className="text-white/20 text-sm">No encontramos tu marca.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-black tracking-tight">Novedades</h1>
        <Button onClick={openNew}>+ Nueva novedad</Button>
      </div>
      <p className="text-sm text-white/40 mb-8">Contale a tu comunidad qué está pasando. Aparece en tu local público.</p>

      {showForm && (
        <div className="border border-white/8 p-6 mb-8 bg-white/2">
          <h2 className="text-sm font-bold mb-5">{editId ? 'Editar novedad' : 'Nueva novedad'}</h2>

          {/* Foto opcional */}
          <div className="mb-5">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Foto (opcional)</p>
            <div
              className="w-full h-36 border border-white/8 overflow-hidden cursor-pointer group relative flex items-center justify-center"
              style={{ background: '#0a0a0a' }}
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview
                ? <img src={imagePreview} alt="" className="w-full h-full object-contain" />
                : <div className="flex flex-col items-center gap-2 text-white/20 group-hover:text-white/40 transition-colors">
                    <span className="text-2xl">＋</span>
                    <span className="text-xs">Subir foto (archivo)</span>
                  </div>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Título *</label>
              <input
                type="text" value={form.titulo} placeholder="Ej: Nueva colección disponible"
                onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Texto</label>
              <textarea
                value={form.contenido} rows={4} placeholder="Contá la novedad..."
                onChange={e => setForm(p => ({ ...p, contenido: e.target.value }))}
                className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {msg && <p className="text-xs text-red-400 mt-3">{msg}</p>}

          <div className="flex gap-3 mt-5">
            <Button loading={saving} onClick={save}>Publicar</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {newsList.length === 0 ? (
        <div className="py-16 text-center border border-white/8 border-dashed">
          <p className="text-sm text-white/20 mb-4">Todavía no publicaste ninguna novedad.</p>
          <Button variant="secondary" onClick={openNew}>Publicar primera novedad</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {newsList.map(n => (
            <div key={n.id} className="border border-white/8 p-5 flex gap-5">
              {n.imagen_url && (
                <img src={n.imagen_url} alt={n.titulo} className="w-20 h-20 object-cover shrink-0 border border-white/8" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <p className="text-sm font-medium">{n.titulo}</p>
                  <Badge variant={n.activa ? 'success' : 'default'}>{n.activa ? 'Publicada' : 'Oculta'}</Badge>
                </div>
                {n.contenido && <p className="text-xs text-white/40 line-clamp-2 mb-3">{n.contenido}</p>}
                <div className="flex gap-3">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(n)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActiva(n)}>{n.activa ? 'Ocultar' : 'Publicar'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteNews(n.id)}>Borrar</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
