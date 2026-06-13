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

  const { count: productCount } = await supabase
    .from('products').select('*', { count: 'exact', head: true })
    .eq('brand_id', brand.id).eq('activo', true)

  const { count: orderCount } = await supabase
    .from('orders').select('*', { count: 'exact', head: true })
    .eq('brand_id', brand.id).eq('estado', 'pendiente')

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
          <Button variant="secondary" size="sm">Ver perfil público ↗</Button>
        </Link>
      </div>

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
              <Button size="sm" type="submit">Solicitar verificación</Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-white/8 mb-10">
        {[
          { label: 'Productos activos', value: productCount ?? 0 },
          { label: 'Órdenes pendientes', value: orderCount ?? 0 },
          { label: 'Estado', value: brand.estado_verificacion === 'aprobada' ? '✓ Activa' : '—' },
        ].map(s => (
          <div key={s.label} className="bg-black p-6">
            <p className="text-3xl font-black mb-1 tabular-nums">{s.value}</p>
            <p className="text-xs text-white/30 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {brand.estado_verificacion === 'aprobada' ? (
        <div className="flex flex-wrap gap-3">
          <Link href="/panel/productos"><Button>+ Nuevo producto</Button></Link>
          <Link href="/panel/ordenes"><Button variant="secondary">Ver órdenes</Button></Link>
        </div>
      ) : (
        <div className="border border-white/8 border-dashed p-8 text-center">
          <p className="text-sm text-white/30 mb-1">Podés publicar productos una vez que tu marca sea verificada.</p>
          <p className="text-xs text-white/20">El proceso de verificación toma 1-3 días hábiles.</p>
        </div>
      )}
    </div>
  )
}
