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

export async function subscribeEmail(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  if (!email) return
  const supabase = await createClient()
  await supabase.from('email_subscribers').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
  revalidatePath('/')
}
