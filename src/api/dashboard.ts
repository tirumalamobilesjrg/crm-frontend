import { supabase } from '../lib/supabase'
import { toAppError } from '../lib/errors'

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query
  if (error) throw toAppError(error)
  return n ?? 0
}

export interface DashboardCounts {
  products: number
  published: number
  devicesInStock: number
  accessorySkus: number
}

export async function loadDashboardCounts(): Promise<DashboardCounts> {
  const head = { count: 'exact' as const, head: true }
  const [products, published, devicesInStock, accessorySkus] = await Promise.all([
    count(supabase.from('products').select('id', head)),
    count(supabase.from('products').select('id', head).eq('is_published', true)),
    count(supabase.from('inventory_items').select('id', head).eq('status', 'in_stock')),
    count(supabase.from('product_variants').select('id', head).eq('tracking_mode', 'quantity').eq('is_active', true)),
  ])
  return { products, published, devicesInStock, accessorySkus }
}

/** Draft purchases waiting to be received (head count only). */
export async function countDraftPurchases(): Promise<number> {
  return count(supabase.from('purchases').select('id', { count: 'exact' as const, head: true }).eq('status', 'draft'))
}
