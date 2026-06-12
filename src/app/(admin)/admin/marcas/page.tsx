import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { VerifiedBadge } from '@/components/brand/VerifiedBadge'

export default async function MarcasAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: brands } = await supabase
    .from('brands')
    .select('*, profiles(email)')
    .order('created_at', { ascending: false })

  async function toggleDestacada(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const current = formData.get('destacada') === 'true'
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.from('brands').update({ destacada: !current }).eq('id', id)
    revalidatePath('/admin/marcas')
  }

  async function toggleSuscripcion(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const current = formData.get('estado') as string
    const next = current === 'activa' ? 'suspendida' : 'activa'
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.from('brands').update({ suscripcion_estado: next }).eq('id', id)
    revalidatePath('/admin/marcas')
  }

  const estadoVerifColor: Record<string, any> = { aprobada: 'success', pendiente: 'warning', rechazada: 'danger' }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black tracking-tight">Marcas</h1>
        <p className="text-xs text-white/30">{brands?.length ?? 0} en total</p>
      </div>

      <div className="divide-y divide-white/8 border border-white/8">
        {brands?.map((b: any) => (
          <div key={b.id} className="px-5 py-4">
            <div className="flex items-start gap-4 flex-wrap">
              {b.logo_url && (
                <img src={b.logo_url} alt={b.nombre} className="w-10 h-10 object-cover border border-white/8 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="text-sm font-medium">{b.nombre}</p>
                  {b.estado_verificacion === 'aprobada' && <VerifiedBadge small />}
                  {b.destacada && <span className="text-xs text-yellow-400">★ Destacada</span>}
                </div>
                <p className="text-xs text-white/30 mb-2">/{b.slug}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant={estadoVerifColor[b.estado_verificacion]}>{b.estado_verificacion}</Badge>
                  <span className="text-xs text-white/25 capitalize">Suscripción: {b.suscripcion_estado}</span>
                  <Link href={`/marcas/${b.slug}`} target="_blank" className="text-xs text-white/20 hover:text-white transition-colors">Ver perfil ↗</Link>
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <form action={toggleDestacada}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="destacada" value={String(!!b.destacada)} />
                  <button className="text-xs border border-white/15 px-3 py-1.5 hover:border-white/40 hover:bg-white/5 transition-colors">
                    {b.destacada ? 'Quitar destacado' : 'Destacar'}
                  </button>
                </form>
                <form action={toggleSuscripcion}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="estado" value={b.suscripcion_estado} />
                  <button className={`text-xs border px-3 py-1.5 transition-colors ${
                    b.suscripcion_estado === 'suspendida'
                      ? 'border-green-400/30 text-green-400 hover:bg-green-400/10'
                      : 'border-red-400/30 text-red-400 hover:bg-red-400/10'
                  }`}>
                    {b.suscripcion_estado === 'suspendida' ? 'Reactivar' : 'Suspender'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
