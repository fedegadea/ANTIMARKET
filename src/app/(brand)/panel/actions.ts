'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitVerification(formData: FormData) {
  const brandId = formData.get('brandId') as string
  const supabase = await createClient()
  await supabase.from('verification_requests').upsert({
    brand_id: brandId,
    estado: 'pendiente',
    fecha_solicitud: new Date().toISOString(),
  })
  await supabase.from('brands').update({ estado_verificacion: 'pendiente' }).eq('id', brandId)
  revalidatePath('/panel')
}

export async function updateOrderStatus(formData: FormData) {
  const orderId = formData.get('orderId') as string
  const nextEstado = formData.get('nextEstado') as string
  const supabase = await createClient()
  await supabase.from('orders').update({ estado: nextEstado }).eq('id', orderId)
  revalidatePath('/panel/ordenes')
}
