import { supabase } from '../lib/supabase'
import type { Brand, Category, Product, ProductRow, TrackingMode, Variant } from '../lib/types'
import { run } from './db'

const PRODUCT_COLUMNS =
  'id, brand_id, category_id, name, slug, description, is_published, published_at, updated_at, brand:brands(name), category:categories(name)'
const VARIANT_COLUMNS =
  'id, product_id, sku, color, ram_gb, storage_gb, mrp, selling_price, public_price, public_price_approved_at, is_active, tracking_mode'

export const listBrands = () => run<Brand[]>(supabase.from('brands').select('id, name, slug, is_active').order('name'))
export const listCategories = () =>
  run<Category[]>(supabase.from('categories').select('id, name, slug, is_active').order('name'))

export const createBrand = (input: { name: string; slug: string }) => run(supabase.from('brands').insert(input))
export const createCategory = (input: { name: string; slug: string }) => run(supabase.from('categories').insert(input))
export const setBrandActive = (id: string, is_active: boolean) =>
  run(supabase.from('brands').update({ is_active }).eq('id', id))
export const setCategoryActive = (id: string, is_active: boolean) =>
  run(supabase.from('categories').update({ is_active }).eq('id', id))

export const listProducts = () =>
  run<ProductRow[]>(supabase.from('products').select(PRODUCT_COLUMNS).order('name') as never)

export const getProduct = (id: string) =>
  run<ProductRow>(supabase.from('products').select(PRODUCT_COLUMNS).eq('id', id).single() as never)

export interface ProductInput {
  brand_id: string
  category_id: string
  name: string
  slug: string
  description: string | null
}

export const createProduct = (input: ProductInput) =>
  run<Product>(supabase.from('products').insert(input).select().single())

export const updateProduct = (id: string, patch: Partial<Omit<ProductInput, 'slug'>>) =>
  run(supabase.from('products').update(patch).eq('id', id))

// Publishing is allowed for Admin and Manager; the database enforces it as well.
export const setPublished = (id: string, is_published: boolean) =>
  run(supabase.from('products').update({ is_published }).eq('id', id))

export const listVariants = (productId: string) =>
  run<Variant[]>(supabase.from('product_variants').select(VARIANT_COLUMNS).eq('product_id', productId).order('sku'))

export interface VariantInput {
  product_id: string
  sku: string
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  mrp: number
  selling_price: number
  public_price: number | null
  tracking_mode: TrackingMode
}

export const createVariant = (input: VariantInput) => run(supabase.from('product_variants').insert(input))

export interface VariantPatch {
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  mrp: number
  selling_price: number
  public_price: number | null
  is_active: boolean
}

export const updateVariant = (id: string, patch: VariantPatch) =>
  run(supabase.from('product_variants').update(patch).eq('id', id))
