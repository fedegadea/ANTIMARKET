import { createClient } from '@/lib/supabase/server'
import { BrandCard } from '@/components/brand/BrandCard'
import { ProductCard } from '@/components/brand/ProductCard'
import type { Brand, Product } from '@/lib/types'

export const revalidate = 60

export default async function HomePage() {
  const supabase = await createClient()

  const [{ data: brands }, { data: products }] = await Promise.all([
    supabase
      .from('brands')
      .select('*')
      .eq('estado_verificacion', 'aprobada')
      .in('suscripcion_estado', ['activa', 'trial'])
      .order('destacada', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('products')
      .select('*, brands(nombre, slug, logo_url, estado_verificacion)')
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const featuredBrands = (brands as Brand[])?.filter(b => b.destacada) ?? []
  const allBrands = (brands as Brand[]) ?? []
  const allProducts = (products as Product[]) ?? []

  return (
    <div className="max-w-7xl mx-auto px-6">

      {/* Hero */}
      <section className="py-24 md:py-36 border-b border-white/8">
        <div className="max-w-3xl">
          <p className="text-xs text-white/30 uppercase tracking-[0.2em] mb-6">El anti Mercado Libre</p>
          <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tighter mb-8">
            Marcas reales.<br />
            <span className="text-white/20">Sin intermediarios.</span>
          </h1>
          <p className="text-base text-white/40 max-w-lg leading-relaxed">
            Un marketplace curado donde cada marca está verificada y vende directo al comprador.
            Cero comisión. Cero revendedores.
          </p>
        </div>
      </section>

      {/* Marcas destacadas */}
      {featuredBrands.length > 0 && (
        <section className="py-16 border-b border-white/8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Destacadas</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-white/8">
            {featuredBrands.map(brand => (
              <div key={brand.id} className="bg-black"><BrandCard brand={brand} /></div>
            ))}
          </div>
        </section>
      )}

      {/* Todos los productos */}
      {allProducts.length > 0 && (
        <section className="py-16 border-b border-white/8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Productos</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-white/8">
            {allProducts.map(product => (
              <div key={product.id} className="bg-black"><ProductCard product={product} /></div>
            ))}
          </div>
        </section>
      )}

      {/* Todas las marcas */}
      <section className="py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
            Todas las marcas {allBrands.length > 0 && `· ${allBrands.length}`}
          </h2>
        </div>

        {allBrands.length === 0 ? (
          <div className="py-24 text-center border border-white/8">
            <p className="text-white/20 text-sm">Todavía no hay marcas aprobadas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-white/8">
            {allBrands.map(brand => (
              <div key={brand.id} className="bg-black"><BrandCard brand={brand} /></div>
            ))}
          </div>
        )}

        {/* CTA para marcas */}
        <div className="mt-16 border border-white/8 p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold tracking-tight mb-2">¿Tu marca quiere formar parte?</h3>
            <p className="text-sm text-white/40">Verificación curada. Badge exclusivo. Venta directa.</p>
          </div>
          <a
            href="/auth/signup?rol=marca"
            className="shrink-0 inline-flex items-center gap-2 h-11 px-7 bg-white text-black text-sm font-semibold tracking-wide hover:bg-neutral-100 transition-colors"
          >
            Solicitar verificación →
          </a>
        </div>
      </section>
    </div>
  )
}
