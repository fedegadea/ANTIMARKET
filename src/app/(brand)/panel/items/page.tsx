'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { Item, Brand } from '@/lib/types'

const BUCKET = 'brand-assets'

type ItemForm = { nombre: string; descripcion: string; link_saliente: string }
const empty: ItemForm = { nombre: '', descripcion: '', link_saliente: '' }

export default function ItemsPanel() {
  const [brand, setBrand] = useState<Brand | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ItemForm>(empty)
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
      const { data: i } = await supabase.from('items').select('*').eq('brand_id', b.id).order('orden').order('created_at', { ascending: false })
      setItems(i as Item[] ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm(empty); setEditId(null); setImagePreview(null); setPendingImage(null)
    setShowForm(true)
  }

  function openEdit(item: Item) {
    setForm({ nombre: item.nombre, descripcion: item.descripcion ?? '', link_saliente: item.link_saliente ?? '' })
    setEditId(item.id)
    setImagePreview(item.imagen_url)
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
    if (!brand || !form.nombre) return
    setSaving(true); setMsg('')
    const supabase = createClient()

    let imagen_url: string | null = imagePreview && !pendingImage ? imagePreview : null

    if (pendingImage) {
      const ext = pendingImage.name.split('.').pop()
      const path = `${brand.id}/items/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pendingImage, { upsert: true })
      if (upErr) { setMsg('Error al subir imagen: ' + upErr.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
      imagen_url = publicUrl
    }

    const payload = {
      brand_id: brand.id,
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      link_saliente: form.link_saliente || null,
      imagen_url,
      activo: true,
    }

    if (editId) {
      await supabase.from('items').update(payload).eq('id', editId)
    } else {
      await supabase.from('items').insert(payload)
    }

    setShowForm(false); setForm(empty); setEditId(null); setImagePreview(null); setPendingImage(null)
    await load()
    setSaving(false)
  }

  async function toggleActivo(item: Item) {
    const supabase = createClient()
    await supabase.from('items').update({ activo: !item.activo }).eq('id', item.id)
    setItems(prev => prev.map(x => x.id === item.id ? { ...x, activo: !x.activo } : x))
  }

  async function deleteItem(id: string) {
    if (!confirm('¿Eliminar este item?')) return
    const supabase = createClient()
    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(x => x.id !== id))
  }

  if (loading) return <p className="text-white/20 text-sm">Cargando...</p>
  if (!brand) return <p className="text-white/20 text-sm">No encontramos tu marca.</p>
  if (brand.estado_verificacion !== 'aprobada') return (
    <div className="py-16 text-center border border-white/8 border-dashed">
      <p className="text-sm text-white/30">Tu marca debe estar verificada para publicar en la vidriera.</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-black tracking-tight">Vidriera</h1>
        <Button onClick={openNew}>+ Agregar foto</Button>
      </div>
      <p className="text-sm text-white/40 mb-8">Cada foto linkea a tu web. Sin precio, sin carrito — pura vidriera.</p>

      {showForm && (
        <div className="border border-white/8 p-6 mb-8 bg-white/2">
          <h2 className="text-sm font-bold mb-5">{editId ? 'Editar item' : 'Nueva foto de vidriera'}</h2>

          {/* Foto */}
          <div className="mb-5">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Foto del item *</p>
            <div
              className="w-full h-48 border border-white/8 overflow-hidden cursor-pointer group relative flex items-center justify-center"
              style={{ background: '#0a0a0a' }}
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview
                ? <img src={imagePreview} alt="" className="w-full h-full object-contain" />
                : <div className="flex flex-col items-center gap-2 text-white/20 group-hover:text-white/40 transition-colors">
                    <span className="text-3xl">＋</span>
                    <span className="text-xs">Subir foto (archivo)</span>
                  </div>
              }
              {imagePreview && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs text-white">Cambiar imagen</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
            <p className="text-xs text-white/20 mt-1.5">JPG, PNG, WEBP · máx 6MB · se muestra entera, sin recorte forzado</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Nombre del item *</label>
              <input
                type="text" value={form.nombre} placeholder="Ej: Campera de cuero negra"
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Link a tu sitio (donde se compra)</label>
              <input
                type="url" value={form.link_saliente} placeholder="https://tumarca.com/producto"
                onChange={e => setForm(p => ({ ...p, link_saliente: e.target.value }))}
                className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors"
              />
              <p className="text-xs text-white/20 mt-1">Al hacer clic en la foto, el visitante va directo a tu web.</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Descripción breve (opcional)</label>
              <textarea
                value={form.descripcion} rows={2} placeholder="Descripción corta..."
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {msg && <p className="text-xs text-red-400 mt-3">{msg}</p>}

          <div className="flex gap-3 mt-5">
            <Button loading={saving} onClick={save}>Guardar</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-16 text-center border border-white/8 border-dashed">
          <p className="text-sm text-white/20 mb-4">Todavía no agregaste fotos a tu vidriera.</p>
          <Button variant="secondary" onClick={openNew}>Agregar primera foto</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-white/8">
          {items.map(item => (
            <div key={item.id} className="bg-black p-0 relative group">
              <div className="aspect-square overflow-hidden bg-neutral-950 flex items-center justify-center">
                {item.imagen_url
                  ? <img src={item.imagen_url} alt={item.nombre} className="w-full h-full object-contain" />
                  : <span className="text-white/10 text-4xl">□</span>
                }
                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>Editar</Button>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => toggleActivo(item)}>{item.activo ? 'Pausar' : 'Activar'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)}>Borrar</Button>
                  </div>
                </div>
              </div>
              <div className="p-3 border-t border-white/8">
                <p className="text-xs font-medium truncate">{item.nombre}</p>
                <div className="flex items-center justify-between mt-1">
                  <Badge variant={item.activo ? 'success' : 'default'} >{item.activo ? 'Activo' : 'Pausado'}</Badge>
                  {item.link_saliente && (
                    <a href={item.link_saliente} target="_blank" rel="noopener" className="text-xs text-white/30 hover:text-white transition-colors truncate max-w-24">↗ link</a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
