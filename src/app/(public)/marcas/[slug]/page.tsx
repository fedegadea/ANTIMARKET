import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductCard } from '@/components/brand/ProductCard'
import { VerifiedBadge } from '@/components/brand/VerifiedBadge'
import type { Product } from '@/lib/types'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('brands').select('nombre, descripcion').eq('slug', slug).single()
  if (!data) return {}
  return { title: data.nombre, description: data.descripcion }
}

export default async function BrandPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', slug)
    .eq('estado_verificacion', 'aprobada')
    .single()

  if (!brand) notFound()

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('brand_id', brand.id)
    .eq('activo', true)
    .order('created_at', { ascending: false })

  const productsWithBrand = (products as Product[])?.map(p => ({
    ...p,
    brands: { nombre: brand.nombre, slug: brand.slug, logo_url: brand.logo_url, estado_verificacion: brand.estado_verificacion }
  })) ?? []

  return (
    <div className="max-w-7xl mx-auto px-6">

      {/* Brand header */}
      <section className="py-16 md:py-24 border-b border-white/8">
        <div className="flex flex-col md:flex-row items-start gap-10">
          {/* Logo */}
          <div className="w-24 h-24 bg-neutral-900 border border-white/8 flex items-center justify-center shrink-0">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt={brand.nombre} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-white/10">{brand.nombre[0]}</span>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">{brand.nombre}</h1>
              <VerifiedBadge />
            </div>

            {brand.descripcion && (
              <p className="text-sm text-white/50 max-w-xl leading-relaxed mb-5">{brand.descripcion}</p>
            )}

            <div className="flex items-center gap-5 text-xs text-white/30">
              {brand.instagram && (
                <a href={`https://instagram.com/${brand.instagram.replace('@','')}`} target="_blank" rel="noopener" className="hover:text-white transition-colors">
                  @{brand.instagram.replace('@','')}
                </a>
              )}
              {brand.sitio_web && (
                <a href={brand.sitio_web} target="_blank" rel="noopener" className="hover:text-white transition-colors">
                  Sitio web ↗
                </a>
              )}
              {brand.categorias?.length > 0 && (
                <span>{brand.categorias.join(' · ')}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="py-12">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40 mb-8">
          Productos · {productsWithBrand.length}
        </h2>

        {productsWithBrand.length === 0 ? (
          <div className="py-20 text-center border border-white/8">
            <p className="text-sm text-white/20">Esta marca todavía no tiene productos publicados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-white/8">
            {productsWithBrand.map(p => (
              <div key={p.id} className="bg-black"><ProductCard product={p} /></div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
