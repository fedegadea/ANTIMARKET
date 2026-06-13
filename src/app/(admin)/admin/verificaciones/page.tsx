import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { approveVerification, rejectVerification } from '../actions'

export default async function VerificacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: requests } = await supabase
    .from('verification_requests')
    .select('*, brands(id, nombre, slug, descripcion, instagram, sitio_web, categorias, logo_url, created_at)')
    .eq('estado', 'pendiente')
    .order('fecha_solicitud', { ascending: true })

  const { data: resolved } = await supabase
    .from('verification_requests')
    .select('*, brands(nombre, slug)')
    .neq('estado', 'pendiente')
    .order('fecha_resolucion', { ascending: false })
    .limit(10)

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-8">Verificaciones pendientes</h1>

      {!requests?.length ? (
        <div className="py-16 text-center border border-white/8 border-dashed mb-10">
          <p className="text-sm text-white/20">No hay solicitudes pendientes.</p>
        </div>
      ) : (
        <div className="space-y-4 mb-12">
          {requests.map((r: any) => {
            const b = r.brands
            return (
              <div key={r.id} className="border border-white/8 p-6">
                <div className="flex items-start gap-5 flex-wrap">
                  {b.logo_url && (
                    <img src={b.logo_url} alt={b.nombre} className="w-16 h-16 object-cover border border-white/8 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h2 className="text-lg font-bold">{b.nombre}</h2>
                      <Link href={`/marcas/${b.slug}`} target="_blank" className="text-xs text-white/30 hover:text-white transition-colors">Ver perfil ↗</Link>
                    </div>
                    {b.descripcion && <p className="text-sm text-white/50 mb-3 line-clamp-3">{b.descripcion}</p>}
                    <div className="flex flex-wrap gap-4 text-xs text-white/30">
                      {b.instagram && <span>Instagram: <a href={`https://instagram.com/${b.instagram.replace('@', '')}`} target="_blank" className="text-white/50 hover:text-white">{b.instagram}</a></span>}
                      {b.sitio_web && <span>Web: <a href={b.sitio_web} target="_blank" className="text-white/50 hover:text-white">{b.sitio_web}</a></span>}
                      {b.categorias?.length > 0 && <span>Cats: {b.categorias.join(', ')}</span>}
                      <span>Registrada: {new Date(b.created_at).toLocaleDateString('es-AR')}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-5 border-t border-white/8 flex items-end gap-4 flex-wrap">
                  <form action={approveVerification} className="shrink-0">
                    <input type="hidden" name="brandId" value={b.id} />
                    <input type="hidden" name="requestId" value={r.id} />
                    <button className="bg-white text-black text-xs font-bold px-4 py-2 hover:bg-white/90 transition-colors">
                      Aprobar
                    </button>
                  </form>
                  <form action={rejectVerification} className="flex items-end gap-2 flex-1">
                    <input type="hidden" name="brandId" value={b.id} />
                    <input type="hidden" name="requestId" value={r.id} />
                    <div className="flex-1">
                      <label className="block text-xs text-white/30 mb-1">Motivo del rechazo (opcional)</label>
                      <input name="notas" type="text" placeholder="Ej: falta información de la marca..."
                        className="w-full border border-white/10 bg-white/5 px-3 py-2 text-xs focus:border-white/30 outline-none transition-colors" />
                    </div>
                    <button className="border border-red-400/40 text-red-400 text-xs px-4 py-2 hover:bg-red-400/10 transition-colors shrink-0">
                      Rechazar
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {resolved && resolved.length > 0 && (
        <>
          <h2 className="text-sm font-bold mb-4 text-white/40 uppercase tracking-widest">Resueltas recientemente</h2>
          <div className="divide-y divide-white/8 border border-white/8">
            {resolved.map((r: any) => (
              <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <p className="text-sm">{r.brands?.nombre}</p>
                <div className="flex items-center gap-3">
                  <Badge variant={r.estado === 'aprobada' ? 'success' : 'danger'}>{r.estado}</Badge>
                  {r.fecha_resolucion && <span className="text-xs text-white/20">{new Date(r.fecha_resolucion).toLocaleDateString('es-AR')}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
