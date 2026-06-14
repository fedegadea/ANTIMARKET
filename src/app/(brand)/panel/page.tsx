import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { VerifiedBadge } from '@/components/brand/VerifiedBadge'
import { submitVerification } from './actions'

export default async function PanelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: brand } = await supabase
    .from('brands').select('*').eq('user_id', user.id).single()

  if (!brand) redirect('/registro')

  const { data: verif } = await supabase
    .from('verification_requests').select('*').eq('brand_id', brand.id).single()

  const [{ count: itemCount }, { count: clickCount }, { count: newsCount }] = await Promise.all([
    supabase.from('items').select('*', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('activo', true),
    supabase.from('outbound_clicks').select('*', { count: 'exact', head: true }).eq('brand_id', brand.id),
    supabase.from('news').select('*', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('activa', true),
  ])

  const estadoColor: Record<string, string> = { pendiente: 'warning', aprobada: 'success', rechazada: 'danger' }

  return (
    <div>
      <div className="flex items-start justify-between mb-10">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black tracking-tight">{brand.nombre}</h1>
            {brand.estado_verificacion === 'aprobada' && <VerifiedBadge />}
          </div>
          <p className="text-sm text-white/40">
            Suscripción: <span className="text-white/70 capitalize">{brand.suscripcion_estado}</span>
          </p>
        </div>
        <Link href={`/marcas/${brand.slug}`} target="_blank">
          <Button variant="secondary" size="sm">Ver local público ↗</Button>
        </Link>
      </div>

      {/* Estado verificación */}
      <div className="border border-white/8 p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Estado de verificación</p>
            <div className="flex items-center gap-3">
              <Badge variant={estadoColor[brand.estado_verificacion] as any}>
                {brand.estado_verificacion}
              </Badge>
              {brand.estado_verificacion === 'pendiente' && (
                <span className="text-xs text-white/30">En revisión por el equipo de Anti Market</span>
              )}
            </div>
            {verif?.notas_admin && (
              <p className="mt-3 text-xs text-white/40 bg-white/5 border border-white/8 px-3 py-2">
                Nota del admin: {verif.notas_admin}
              </p>
            )}
          </div>
          {brand.estado_verificacion === 'rechazada' && (
            <form action={submitVerification}>
              <input type="hidden" name="brandId" value={brand.id} />
              <Button size="sm" type="submit">Re-solicitar verificación</Button>
            </form>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-px bg-white/8 mb-10">
        {[
          { label: 'Fotos en vidriera', value: itemCount ?? 0 },
          { label: 'Clicks a tu web', value: clickCount ?? 0 },
          { label: 'Novedades activas', value: newsCount ?? 0 },
        ].map(s => (
          <div key={s.label} className="bg-black p-6">
            <p className="text-3xl font-black mb-1 tabular-nums">{s.value}</p>
            <p className="text-xs text-white/30 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Acciones rápidas */}
      {brand.estado_verificacion === 'aprobada' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/panel/local">
            <div className="border border-white/8 p-5 hover:border-white/20 transition-colors cursor-pointer">
              <p className="text-sm font-bold mb-1">Mi local</p>
              <p className="text-xs text-white/30">Banner, logo, color e info de contacto</p>
            </div>
          </Link>
          <Link href="/panel/items">
            <div className="border border-white/8 p-5 hover:border-white/20 transition-colors cursor-pointer">
              <p className="text-sm font-bold mb-1">Vidriera</p>
              <p className="text-xs text-white/30">Fotos que linkan a tu web</p>
            </div>
          </Link>
          <Link href="/panel/news">
            <div className="border border-white/8 p-5 hover:border-white/20 transition-colors cursor-pointer">
              <p className="text-sm font-bold mb-1">Novedades</p>
              <p className="text-xs text-white/30">Contale a tu comunidad qué pasa</p>
            </div>
          </Link>
        </div>
      ) : (
        <div className="border border-white/8 border-dashed p-8 text-center">
          <p className="text-sm text-white/30 mb-1">Podés armar tu local una vez que tu marca sea verificada.</p>
          <p className="text-xs text-white/20">El proceso toma 1-3 días hábiles.</p>
        </div>
      )}
    </div>
  )
}
