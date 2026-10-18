import { parseRupees } from '../../lib/money'
import type { Errors } from '../catalogue/validation'

export interface SupplierForm {
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

export function validateSupplier(f: SupplierForm): Errors<keyof SupplierForm> {
  const errors: Errors<keyof SupplierForm> = {}
  const name = f.name.trim()
  if (name.length < 1 || name.length > 160) errors.name = 'Enter the supplier name (up to 160 characters).'
  if (f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = 'Enter a valid email address, or leave it empty.'
  return errors
}

export interface PurchaseForm {
  supplier_id: string
  invoiceNo: string
  invoiceDate: string
  notes: string
}

export function validatePurchase(f: PurchaseForm): Errors<keyof PurchaseForm> {
  const errors: Errors<keyof PurchaseForm> = {}
  if (!f.supplier_id) errors.supplier_id = 'Choose a supplier.'
  const no = f.invoiceNo.trim()
  if (no.length < 1 || no.length > 64) errors.invoiceNo = 'Enter the supplier invoice number (up to 64 characters).'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.invoiceDate)) errors.invoiceDate = 'Choose the invoice date.'
  return errors
}

export interface LineForm {
  variant_id: string
  quantity: string
  unitCost: string
}

export function validateLine(f: LineForm): { errors: Errors<keyof LineForm>; value: { variant_id: string; quantity: number; unit_cost: number } | null } {
  const errors: Errors<keyof LineForm> = {}
  if (!f.variant_id) errors.variant_id = 'Choose a variant.'
  const q = f.quantity.trim()
  const quantity = /^\d+$/.test(q) ? Number(q) : NaN
  if (!(quantity >= 1 && quantity <= 500)) errors.quantity = 'Quantity must be a whole number from 1 to 500.'
  const unitCost = parseRupees(f.unitCost)
  if (unitCost === null || unitCost <= 0) errors.unitCost = 'Enter the cost per unit in rupees (at most 2 decimals).'
  if (Object.keys(errors).length > 0 || unitCost === null) return { errors, value: null }
  return { errors, value: { variant_id: f.variant_id, quantity, unit_cost: unitCost } }
}

export const variantLabel = (v: { sku: string; color: string | null; ram_gb: number | null; storage_gb: number | null; product: { name: string } | null }): string => {
  const spec = [v.color, v.ram_gb ? `${v.ram_gb}GB RAM` : null, v.storage_gb ? `${v.storage_gb}GB` : null].filter(Boolean).join(' ')
  return `${v.product?.name ?? ''}${spec ? ` ${spec}` : ''} (${v.sku})`.trim()
}

export const todayLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
