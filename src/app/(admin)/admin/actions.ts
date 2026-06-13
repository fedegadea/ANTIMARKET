'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function approveVerification(formData: FormData) {
  const brandId = formData.get('brandId') as string
  const requestId = formData.get('requestId') as string
  const supabase = await createClient()
  await supabase.from('brands').update({ estado_verificacion: 'aprobada' }).eq('id', brandId)
  await supabase.from('verification_requests').update({ estado: 'aprobada', fecha_resolucion: new Date().toISOString() }).eq('id', requestId)
  revalidatePath('/admin/verificaciones')
}

export async function rejectVerification(formData: FormData) {
  const brandId = formData.get('brandId') as string
  const requestId = formData.get('requestId') as string
  const notas = formData.get('notas') as string
  const supabase = await createClient()
  await supabase.from('brands').update({ estado_verificacion: 'rechazada' }).eq('id', brandId)
  await supabase.from('verification_requests').update({ estado: 'rechazada', notas_admin: notas || null, fecha_resolucion: new Date().toISOString() }).eq('id', requestId)
  revalidatePath('/admin/verificaciones')
}

export async function toggleDestacada(formData: FormData) {
  const id = formData.get('id') as string
  const current = formData.get('destacada') === 'true'
  const supabase = await createClient()
  await supabase.from('brands').update({ destacada: !current }).eq('id', id)
  revalidatePath('/admin/marcas')
}

export async function toggleSuscripcion(formData: FormData) {
  const id = formData.get('id') as string
  const current = formData.get('estado') as string
  const next = current === 'activa' ? 'suspendida' : 'activa'
  const supabase = await createClient()
  await supabase.from('brands').update({ suscripcion_estado: next }).eq('id', id)
  revalidatePath('/admin/marcas')
}

export async function updateOrderStatus(formData: FormData) {
  const orderId = formData.get('orderId') as string
  const nextEstado = formData.get('nextEstado') as string
  const supabase = await createClient()
  await supabase.from('orders').update({ estado: nextEstado }).eq('id', orderId)
  revalidatePath('/panel/ordenes')
}

export async function submitVerification(formData: FormData) {
  const brandId = formData.get('brandId') as string
  const supabase = await createClient()
  await supabase.from('verification_requests').upsert({ brand_id: brandId, estado: 'pendiente' })
  revalidatePath('/panel')
}
