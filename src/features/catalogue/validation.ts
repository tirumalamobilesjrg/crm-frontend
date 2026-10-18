import { parseRupees, toPaise } from '../../lib/money'
import type { TrackingMode } from '../../lib/types'

export type Errors<K extends string> = Partial<Record<K, string>>

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/

export interface ProductForm {
  name: string
  brand_id: string
  category_id: string
  description: string
}

export function validateProduct(f: ProductForm): Errors<keyof ProductForm> {
  const errors: Errors<keyof ProductForm> = {}
  const name = f.name.trim()
  if (name.length < 1 || name.length > 160) errors.name = 'Enter a product name (up to 160 characters).'
  if (!f.brand_id) errors.brand_id = 'Choose a brand.'
  if (!f.category_id) errors.category_id = 'Choose a category.'
  return errors
}

export interface VariantForm {
  sku: string
  color: string
  ram: string
  storage: string
  mrp: string
  selling: string
  publicPrice: string
  trackingMode: TrackingMode
}

export interface ParsedVariant {
  sku: string
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  mrp: number
  selling_price: number
  public_price: number | null
  tracking_mode: TrackingMode
}

function optionalPositiveInt(text: string): number | null | 'invalid' {
  const t = text.trim()
  if (t === '') return null
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : 'invalid'
}

export function validateVariant(f: VariantForm): { errors: Errors<keyof VariantForm>; value: ParsedVariant | null } {
  const errors: Errors<keyof VariantForm> = {}
  const sku = f.sku.trim().toUpperCase()
  if (!SKU_PATTERN.test(sku)) errors.sku = 'SKU: 2-40 characters, letters/digits and . _ - only.'

  const ram = optionalPositiveInt(f.ram)
  if (ram === 'invalid') errors.ram = 'RAM must be a whole number of GB.'
  const storage = optionalPositiveInt(f.storage)
  if (storage === 'invalid') errors.storage = 'Storage must be a whole number of GB.'

  const mrp = parseRupees(f.mrp)
  if (mrp === null || mrp <= 0) errors.mrp = 'Enter the MRP in rupees (at most 2 decimals).'
  const selling = parseRupees(f.selling)
  if (selling === null || selling <= 0) errors.selling = 'Enter the selling price in rupees (at most 2 decimals).'
  if (mrp !== null && selling !== null && toPaise(selling) > toPaise(mrp)) errors.selling = 'Selling price cannot be above the MRP.'

  let publicPrice: number | null = null
  if (f.publicPrice.trim() !== '') {
    publicPrice = parseRupees(f.publicPrice)
    if (publicPrice === null) errors.publicPrice = 'Enter the website price in rupees, or leave it empty.'
    else if (mrp !== null && toPaise(publicPrice) > toPaise(mrp)) errors.publicPrice = 'Website price cannot be above the MRP.'
  }

  if (Object.keys(errors).length > 0 || mrp === null || selling === null || ram === 'invalid' || storage === 'invalid') {
    return { errors, value: null }
  }
  return {
    errors,
    value: {
      sku,
      color: f.color.trim() === '' ? null : f.color.trim(),
      ram_gb: ram,
      storage_gb: storage,
      mrp,
      selling_price: selling,
      public_price: publicPrice,
      tracking_mode: f.trackingMode,
    },
  }
}
