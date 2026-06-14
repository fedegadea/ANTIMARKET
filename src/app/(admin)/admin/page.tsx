import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { count: totalBrands },
    { count: pendingVerif },
    { count: totalItems },
    { count: totalClicks },
    { count: totalSubscribers },
  ] = await Promise.all([
    supabase.from('brands').select('*', { count: 'exact', head: true }),
    supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    supabase.from('items').select('*', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('outbound_clicks').select('*', { count: 'exact', head: true }),
    supabase.from('email_subscribers').select('*', { count: 'exact', head: true }),
  ])

  const { data: recentBrands } = await supabase
    .from('brands').select('id, nombre, slug, estado_verificacion, created_at')
    .order('created_at', { ascending: false }).limit(5)

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-10">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/8 mb-10">
        {[
          { label: 'Marcas', value: totalBrands ?? 0, href: '/admin/marcas' },
          { label: 'Pendientes', value: pendingVerif ?? 0, href: '/admin/verificaciones', highlight: (pendingVerif ?? 0) > 0 },
          { label: 'Items en vidriera', value: totalItems ?? 0 },
          { label: 'Clicks salientes', value: totalClicks ?? 0 },
          { label: 'Suscriptores', value: totalSubscribers ?? 0 },
        ].map(s => s.href ? (
          <Link key={s.label} href={s.href} className="bg-black p-6 hover:bg-white/3 transition-colors block">
            <p className={`text-3xl font-black mb-1 tabular-nums ${(s as any).highlight ? 'text-yellow-400' : ''}`}>{s.value}</p>
            <p className="text-xs text-white/30 uppercase tracking-widest">{s.label}</p>
          </Link>
        ) : (
          <div key={s.label} className="bg-black p-6">
            <p className="text-3xl font-black mb-1 tabular-nums">{s.value}</p>
            <p className="text-xs text-white/30 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {(pendingVerif ?? 0) > 0 && (
        <div className="border border-yellow-400/20 bg-yellow-400/5 p-4 mb-8 flex items-center justify-between">
          <p className="text-sm text-yellow-400/80">{pendingVerif} marca{pendingVerif !== 1 ? 's' : ''} esperando verificación</p>
          <Link href="/admin/verificaciones" className="text-xs text-yellow-400 border border-yellow-400/30 px-3 py-1.5 hover:bg-yellow-400/10 transition-colors">
            Revisar →
          </Link>
        </div>
      )}

      <h2 className="text-sm font-bold mb-4 text-white/60 uppercase tracking-widest">Marcas recientes</h2>
      <div className="divide-y divide-white/8 border border-white/8">
        {recentBrands?.map(b => (
          <div key={b.id} className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{b.nombre}</p>
              <p className="text-xs text-white/30">/{b.slug}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 border ${
                b.estado_verificacion === 'aprobada' ? 'border-green-400/30 text-green-400' :
                b.estado_verificacion === 'rechazada' ? 'border-red-400/30 text-red-400' :
                'border-yellow-400/30 text-yellow-400'
              }`}>{b.estado_verificacion}</span>
              <span className="text-xs text-white/20">{new Date(b.created_at).toLocaleDateString('es-AR')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
