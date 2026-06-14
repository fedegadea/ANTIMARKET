import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('item')
  const url = searchParams.get('url')

  if (itemId) {
    try {
      const supabase = await createClient()
      const { data: item } = await supabase.from('items').select('brand_id').eq('id', itemId).single()
      if (item) {
        await supabase.from('outbound_clicks').insert({ item_id: itemId, brand_id: item.brand_id })
      }
    } catch {}
  }

  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    return NextResponse.redirect(url)
  }
  return NextResponse.redirect(new URL('/', request.url))
}
