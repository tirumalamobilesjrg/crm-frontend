// Hand-written subset of the backend schema (crm-backend, migrations 0001-0019). Replace with
// `supabase gen types typescript` output once the project is linked.

export type StaffRole = 'admin' | 'manager'
export type TrackingMode = 'serialized' | 'quantity'

export interface StaffProfile {
  user_id: string
  full_name: string
  role: StaffRole
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface Brand {
  id: string
  name: string
  slug: string
  is_active: boolean
}

export interface Category {
  id: string
  name: string
  slug: string
  is_active: boolean
}

export interface Product {
  id: string
  brand_id: string
  category_id: string
  name: string
  slug: string
  description: string | null
  is_published: boolean
  published_at: string | null
  updated_at: string
}

export interface ProductRow extends Product {
  brand: { name: string } | null
  category: { name: string } | null
}

export interface Variant {
  id: string
  product_id: string
  sku: string
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  mrp: number
  selling_price: number
  public_price: number | null
  public_price_approved_at: string | null
  is_active: boolean
  tracking_mode: TrackingMode
}

export interface DiscountPolicy {
  role: StaffRole
  can_discount: boolean
  max_percent: number
  max_amount: number | null
  can_approve: boolean
  configured_at: string | null
}
