'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { Product, Brand } from '@/lib/types'

type ProductForm = { nombre: string; descripcion: string; precio: string; categoria: string; stock: string; imagenes: string }

const emptyForm: ProductForm = { nombre: '', descripcion: '', precio: '', categoria: '', stock: '0', imagenes: '' }

export default function ProductosPanel() {
  const [brand, setBrand] = useState<Brand | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: b } = await supabase.from('brands').select('*').eq('user_id', user.id).single()
    setBrand(b as Brand)
    if (b) {
      const { data: p } = await supabase.from('products').select('*').eq('brand_id', b.id).order('created_at', { ascending: false })
      setProducts(p as Product[] ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!brand || !form.nombre || !form.precio) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      brand_id: brand.id,
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      precio: parseFloat(form.precio),
      categoria: form.categoria || null,
      stock: parseInt(form.stock) || 0,
      imagenes: form.imagenes ? form.imagenes.split('\n').map(s => s.trim()).filter(Boolean) : [],
      activo: true,
    }
    if (editId) {
      await supabase.from('products').update(payload).eq('id', editId)
    } else {
      await supabase.from('products').insert(payload)
    }
    setForm(emptyForm); setEditId(null); setShowForm(false)
    await load()
    setSaving(false)
  }

  async function toggleActivo(p: Product) {
    const supabase = createClient()
    await supabase.from('products').update({ activo: !p.activo }).eq('id', p.id)
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, activo: !x.activo } : x))
  }

  function startEdit(p: Product) {
    setForm({
      nombre: p.nombre, descripcion: p.descripcion ?? '', precio: String(p.precio),
      categoria: p.categoria ?? '', stock: String(p.stock),
      imagenes: p.imagenes?.join('\n') ?? '',
    })
    setEditId(p.id)
    setShowForm(true)
  }

  if (loading) return <p className="text-white/20 text-sm">Cargando...</p>
  if (!brand) return <p className="text-white/20 text-sm">No encontramos tu marca.</p>
  if (brand.estado_verificacion !== 'aprobada') return (
    <div className="py-16 text-center border border-white/8 border-dashed">
      <p className="text-sm text-white/30">Tu marca debe estar verificada para publicar productos.</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black tracking-tight">Productos</h1>
        <Button onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true) }}>+ Nuevo</Button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="border border-white/8 p-6 mb-8 bg-white/2">
          <h2 className="text-sm font-bold mb-5">{editId ? 'Editar producto' : 'Nuevo producto'}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { key: 'nombre', label: 'Nombre *', type: 'text', span: true },
              { key: 'precio', label: 'Precio (ARS) *', type: 'number' },
              { key: 'stock', label: 'Stock', type: 'number' },
              { key: 'categoria', label: 'Categoría', type: 'text' },
            ].map(f => (
              <div key={f.key} className={f.span ? 'md:col-span-2' : ''}>
                <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">{f.label}</label>
                <input
                  type={f.type}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Descripción</label>
              <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={3}
                className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors resize-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">URLs de imágenes (una por línea)</label>
              <textarea value={form.imagenes} onChange={e => setForm(p => ({ ...p, imagenes: e.target.value }))} rows={3}
                className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors resize-none font-mono"
                placeholder="https://..." />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <Button loading={saving} onClick={save}>Guardar</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {products.length === 0 ? (
        <div className="py-16 text-center border border-white/8 border-dashed">
          <p className="text-sm text-white/20">Todavía no publicaste ningún producto.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/8 border border-white/8">
          {products.map(p => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 bg-neutral-900 shrink-0 overflow-hidden">
                {p.imagenes?.[0] && <img src={p.imagenes[0]} alt={p.nombre} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                <p className="text-xs text-white/30 tabular-nums">
                  {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(p.precio)}
                  {' · '}stock {p.stock}
                </p>
              </div>
              <Badge variant={p.activo ? 'success' : 'default'}>{p.activo ? 'Activo' : 'Pausado'}</Badge>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActivo(p)}>{p.activo ? 'Pausar' : 'Activar'}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
