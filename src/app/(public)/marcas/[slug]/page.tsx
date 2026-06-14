import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VerifiedBadge } from '@/components/brand/VerifiedBadge'
import { subscribeEmail } from '@/app/(brand)/panel/actions'
import type { Item, News } from '@/lib/types'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('brands')
    .select('nombre, descripcion, logo_url, banner_url')
    .eq('slug', slug).single()
  if (!data) return {}

  const image = data.banner_url || data.logo_url
  return {
    title: data.nombre,
    description: data.descripcion,
    openGraph: {
      title: data.nombre,
      description: data.descripcion ?? undefined,
      type: 'website',
      images: image ? [{ url: image, width: 1200, height: 630, alt: data.nombre }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: data.nombre,
      description: data.descripcion ?? undefined,
      images: image ? [image] : [],
    },
  }
}

export default async function BrandPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: brand } = await supabase
    .from('brands').select('*').eq('slug', slug)
    .eq('estado_verificacion', 'aprobada').single()

  if (!brand) notFound()

  const [{ data: items }, { data: newsList }] = await Promise.all([
    supabase.from('items').select('*').eq('brand_id', brand.id)
      .eq('activo', true).order('orden').order('created_at', { ascending: false }),
    supabase.from('news').select('*').eq('brand_id', brand.id)
      .eq('activa', true).order('created_at', { ascending: false }).limit(6),
  ])

  const acento = brand.color_acento || '#ffffff'

  return (
    <div>
      {/* Banner */}
      {brand.banner_url && (
        <div className="w-full border-b border-white/8 overflow-hidden flex items-center justify-center bg-black" style={{ maxHeight: 360 }}>
          <img src={brand.banner_url} alt={`${brand.nombre} banner`} className="w-full object-contain" style={{ maxHeight: 360 }} />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6">

        {/* Cabecera de marca */}
        <section className="py-12 md:py-16 border-b border-white/8">
          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Logo */}
            <div className="w-20 h-20 border border-white/8 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: '#0a0a0a' }}>
              {brand.logo_url
                ? <img src={brand.logo_url} alt={brand.nombre} className="w-full h-full object-contain" />
                : <span className="text-3xl font-black" style={{ color: acento }}>{brand.nombre[0]}</span>
              }
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">{brand.nombre}</h1>
                <VerifiedBadge />
              </div>

              {brand.descripcion && (
                <p className="text-sm text-white/50 max-w-xl leading-relaxed mb-5">{brand.descripcion}</p>
              )}

              <div className="flex items-center gap-5 text-xs text-white/30 flex-wrap">
                {brand.instagram && (
                  <a href={`https://instagram.com/${brand.instagram.replace('@','')}`} target="_blank" rel="noopener"
                    className="hover:text-white transition-colors">
                    @{brand.instagram.replace('@','')}
                  </a>
                )}
                {brand.sitio_web && (
                  <a href={brand.sitio_web} target="_blank" rel="noopener" className="hover:text-white transition-colors">
                    Sitio web ↗
                  </a>
                )}
                {brand.categorias?.length > 0 && <span>{brand.categorias.join(' · ')}</span>}
              </div>
            </div>
          </div>
        </section>

        {/* Novedades */}
        {newsList && newsList.length > 0 && (
          <section className="py-10 border-b border-white/8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40 mb-6">Novedades</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(newsList as News[]).map(n => (
                <div key={n.id} className="border border-white/8 overflow-hidden">
                  {n.imagen_url && (
                    <div className="aspect-video overflow-hidden bg-neutral-950 flex items-center justify-center">
                      <img src={n.imagen_url} alt={n.titulo} className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-sm font-semibold mb-1">{n.titulo}</p>
                    {n.contenido && <p className="text-xs text-white/40 line-clamp-3 leading-relaxed">{n.contenido}</p>}
                    <p className="text-xs text-white/20 mt-3">{new Date(n.created_at).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Vidriera de items */}
        <section className="py-10 border-b border-white/8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40 mb-6">
            Vidriera · {items?.length ?? 0}
          </h2>

          {!items?.length ? (
            <div className="py-16 text-center border border-white/8">
              <p className="text-sm text-white/20">Esta marca todavía no publicó fotos en su vidriera.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-white/8">
              {(items as Item[]).map(item => (
                <div key={item.id} className="bg-black group relative">
                  <a
                    href={item.link_saliente
                      ? `/api/click?item=${item.id}&url=${encodeURIComponent(item.link_saliente)}`
                      : undefined}
                    target={item.link_saliente ? '_blank' : undefined}
                    rel="noopener"
                    className={item.link_saliente ? 'cursor-pointer' : 'cursor-default'}
                  >
                    <div className="aspect-square overflow-hidden bg-neutral-950 flex items-center justify-center">
                      {item.imagen_url
                        ? <img src={item.imagen_url} alt={item.nombre}
                            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" />
                        : <span className="text-white/10 text-5xl">□</span>
                      }
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium truncate">{item.nombre}</p>
                      {item.descripcion && (
                        <p className="text-xs text-white/30 truncate mt-0.5">{item.descripcion}</p>
                      )}
                      {item.link_saliente && (
                        <p className="text-xs mt-2 transition-colors" style={{ color: acento }}>
                          Ver en la tienda →
                        </p>
                      )}
                    </div>
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Email subscribe */}
        <section className="py-16 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-white/30 mb-3">Anti Market</p>
          <h3 className="text-xl font-black tracking-tight mb-2">¿Querés enterarte de todo?</h3>
          <p className="text-sm text-white/40 mb-8 max-w-md mx-auto">
            Dejá tu email y te avisamos cuando haya nuevas marcas y novedades.
          </p>
          <form action={subscribeEmail} className="flex gap-0 max-w-sm mx-auto">
            <input
              type="email" name="email" required placeholder="tu@email.com"
              className="flex-1 border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-white/30 outline-none transition-colors"
            />
            <button
              type="submit"
              className="px-5 py-3 text-xs font-bold uppercase tracking-widest bg-white text-black hover:bg-white/90 transition-colors border border-white"
            >
              Suscribirse
            </button>
          </form>
        </section>

      </div>
    </div>
  )
}
