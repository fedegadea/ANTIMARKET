import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'

export default async function OrdenesPanel() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: brand } = await supabase.from('brands').select('id').eq('user_id', user.id).single()
  if (!brand) redirect('/registro')

  const { data: orders } = await supabase
    .from('orders')
    .select('*, products(nombre, imagenes)')
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false })

  const estadoBadge: Record<string, any> = {
    pendiente: 'warning', confirmada: 'success', enviada: 'default', entregada: 'outline'
  }

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-8">Órdenes</h1>

      {!orders?.length ? (
        <div className="py-16 text-center border border-white/8 border-dashed">
          <p className="text-sm text-white/20">Todavía no recibiste órdenes.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/8 border border-white/8">
          {orders.map((o: any) => (
            <div key={o.id} className="px-5 py-4 flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <p className="text-sm font-medium">{o.products?.nombre ?? '—'}</p>
                  <Badge variant={estadoBadge[o.estado]}>{o.estado}</Badge>
                </div>
                <p className="text-xs text-white/30 tabular-nums mb-1">
                  {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(o.total)}
                  {' · '}cant. {o.cantidad}
                  {' · '}{new Date(o.created_at).toLocaleDateString('es-AR')}
                </p>
                {o.datos_envio && (
                  <p className="text-xs text-white/25">
                    {o.datos_envio.nombre} — {o.datos_envio.ciudad} — {o.datos_envio.email}
                  </p>
                )}
                {o.notas && <p className="text-xs text-white/20 mt-1 italic">"{o.notas}"</p>}
              </div>
              <UpdateOrderStatus orderId={o.id} current={o.estado} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UpdateOrderStatus({ orderId, current }: { orderId: string; current: string }) {
  const next: Record<string, string> = { pendiente: 'confirmada', confirmada: 'enviada', enviada: 'entregada' }
  const nextEstado = next[current]
  if (!nextEstado) return null

  return (
    <form action={async () => {
      'use server'
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      await supabase.from('orders').update({ estado: nextEstado }).eq('id', orderId)
    }}>
      <button className="text-xs border border-white/15 px-3 py-1.5 hover:border-white/40 hover:bg-white/5 transition-colors capitalize">
        → {nextEstado}
      </button>
    </form>
  )
}
