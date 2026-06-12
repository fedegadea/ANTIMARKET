'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { VerifiedBadge } from '@/components/brand/VerifiedBadge'
import type { Product } from '@/lib/types'

function formatPrice(precio: number, moneda: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, minimumFractionDigits: 0 }).format(precio)
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [bought, setBought] = useState(false)
  const [selectedImg, setSelectedImg] = useState(0)
  const [form, setForm] = useState({ nombre: '', email: '', direccion: '', ciudad: '', notas: '' })
  const [showCheckout, setShowCheckout] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('products')
      .select('*, brands(nombre, slug, logo_url, estado_verificacion, instagram)')
      .eq('id', id)
      .eq('activo', true)
      .single()
      .then(({ data }) => { setProduct(data as Product); setLoading(false) })
  }, [id])

  async function handleOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!product) return
    setBuying(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    await supabase.from('orders').insert({
      product_id: product.id,
      brand_id: product.brand_id,
      comprador_id: user.id,
      cantidad: 1,
      total: product.precio,
      datos_envio: { nombre: form.nombre, email: form.email, direccion: form.direccion, ciudad: form.ciudad },
      notas: form.notas || null,
    })
    setBuying(false)
    setBought(true)
  }

  if (loading) return <div className="max-w-7xl mx-auto px-6 pt-16 text-white/20 text-sm">Cargando...</div>
  if (!product) return <div className="max-w-7xl mx-auto px-6 pt-16 text-white/20 text-sm">Producto no encontrado.</div>

  const imgs = product.imagenes ?? []
  const brand = product.brands as any

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 md:py-20">
      <div className="grid md:grid-cols-2 gap-12 lg:gap-20">

        {/* Imágenes */}
        <div>
          <div className="aspect-square bg-neutral-950 border border-white/8 overflow-hidden flex items-center justify-center mb-3">
            {imgs[selectedImg] ? (
              <img src={imgs[selectedImg]} alt={product.nombre} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white/10 text-6xl font-black">?</span>
            )}
          </div>
          {imgs.length > 1 && (
            <div className="flex gap-2">
              {imgs.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImg(i)}
                  className={`w-16 h-16 border overflow-hidden ${i === selectedImg ? 'border-white' : 'border-white/10 opacity-50 hover:opacity-80'} transition-opacity`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {/* Brand link */}
          {brand && (
            <Link href={`/marcas/${brand.slug}`} className="inline-flex items-center gap-2 mb-5 text-xs text-white/40 hover:text-white transition-colors">
              {brand.logo_url && <img src={brand.logo_url} alt={brand.nombre} className="w-5 h-5 object-cover rounded-sm" />}
              {brand.nombre}
              {brand.estado_verificacion === 'aprobada' && <VerifiedBadge small />}
            </Link>
          )}

          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight mb-4">{product.nombre}</h1>
          <p className="text-2xl font-bold tabular-nums mb-6">{formatPrice(product.precio, product.moneda)}</p>

          {product.descripcion && (
            <p className="text-sm text-white/50 leading-relaxed mb-8">{product.descripcion}</p>
          )}

          {product.stock === 0 ? (
            <p className="text-sm text-red-400 border border-red-400/20 px-4 py-3">Sin stock disponible</p>
          ) : bought ? (
            <div className="border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
              <p className="text-emerald-400 font-medium text-sm mb-1">¡Pedido generado!</p>
              <p className="text-xs text-white/40">La marca te contactará para coordinar el pago y envío.</p>
            </div>
          ) : !showCheckout ? (
            <Button size="lg" className="w-full" onClick={() => setShowCheckout(true)}>
              Comprar directo a la marca →
            </Button>
          ) : (
            <form onSubmit={handleOrder} className="space-y-4 border border-white/8 p-5">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Datos de envío</p>
              {[
                { key: 'nombre', label: 'Nombre completo', type: 'text' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'direccion', label: 'Dirección', type: 'text' },
                { key: 'ciudad', label: 'Ciudad / Provincia', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-white/40 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    required
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-white/40 mb-1">Notas (opcional)</label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(prev => ({ ...prev, notas: e.target.value }))}
                  rows={2}
                  className="w-full border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 outline-none transition-colors resize-none"
                />
              </div>
              <Button type="submit" loading={buying} className="w-full">Confirmar pedido</Button>
              <button type="button" onClick={() => setShowCheckout(false)} className="w-full text-xs text-white/30 hover:text-white transition-colors py-1">Cancelar</button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-white/8 text-xs text-white/25 space-y-1">
            <p>Vendido directamente por {brand?.nombre ?? 'la marca'}.</p>
            <p>Anti Market no intermedia el pago ni el envío.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
