import { supabase } from '../lib/supabase'
import type { Purchase, PurchaseLine, PurchaseRow, ReceiveResult, ReceiveUnit, Supplier, VariantOption } from '../lib/types'
import { run } from './db'

const SUPPLIER_COLUMNS = 'id, name, phone, email, address, notes, is_active'
const PURCHASE_COLUMNS = 'id, supplier_id, supplier_invoice_no, invoice_date, status, total, notes, received_at, created_at'
const LINE_COLUMNS =
  'id, purchase_id, variant_id, quantity, unit_cost, line_total, variant:product_variants(sku, color, ram_gb, storage_gb, tracking_mode, product:products(name))'

export const listSuppliers = () => run<Supplier[]>(supabase.from('suppliers').select(SUPPLIER_COLUMNS).order('name'))

export interface SupplierInput {
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

export const createSupplier = (input: SupplierInput) => run<Supplier>(supabase.from('suppliers').insert(input).select(SUPPLIER_COLUMNS).single())

export const setSupplierActive = (id: string, is_active: boolean) => run(supabase.from('suppliers').update({ is_active }).eq('id', id))

export const listPurchases = () =>
  run<PurchaseRow[]>(
    supabase.from('purchases').select(`${PURCHASE_COLUMNS}, supplier:suppliers(name)`).order('created_at', { ascending: false }) as never,
  )

export const getPurchase = (id: string) =>
  run<PurchaseRow>(supabase.from('purchases').select(`${PURCHASE_COLUMNS}, supplier:suppliers(name)`).eq('id', id).single() as never)

export interface PurchaseInput {
  supplier_id: string
  supplier_invoice_no: string
  invoice_date: string
  notes: string | null
}

export const createPurchase = (input: PurchaseInput) => run<Purchase>(supabase.from('purchases').insert(input).select(PURCHASE_COLUMNS).single())

/** Drafts only; the database refuses any other state change (receiving goes through receive_purchase). */
export const cancelPurchase = (id: string) => run(supabase.from('purchases').update({ status: 'cancelled' }).eq('id', id))

export const listPurchaseLines = (purchaseId: string) =>
  run<PurchaseLine[]>(supabase.from('purchase_items').select(LINE_COLUMNS).eq('purchase_id', purchaseId).order('created_at') as never)

export interface PurchaseLineInput {
  purchase_id: string
  variant_id: string
  quantity: number
  unit_cost: number
}

export const addPurchaseLine = (input: PurchaseLineInput) => run(supabase.from('purchase_items').insert(input))
export const removePurchaseLine = (id: string) => run(supabase.from('purchase_items').delete().eq('id', id))

export const listVariantOptions = () =>
  run<VariantOption[]>(
    supabase
      .from('product_variants')
      .select('id, sku, color, ram_gb, storage_gb, tracking_mode, is_active, product:products(name)')
      .eq('is_active', true)
      .order('sku') as never,
  )

/** `units` has one entry per phone; use [] for accessory-only purchases. The same key must be reused when retrying the same attempt. */
export const receivePurchase = (purchaseId: string, units: ReceiveUnit[], idempotencyKey: string) =>
  run<ReceiveResult>(
    supabase.rpc('receive_purchase', { p_idempotency_key: idempotencyKey, p_purchase_id: purchaseId, p_units: units }) as never,
  )
