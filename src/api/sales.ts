import { supabase } from '../lib/supabase'
import { toAppError } from '../lib/errors'
import type { Customer, DiscountApproval, FinalizeSaleResult, Invoice, PaymentMethod, SaleListRow, SellableAccessory, SellableDevice } from '../lib/types'
import { run } from './db'
import { PAGE_SIZE } from './inventory'

// Sales, invoices, payments and discount approvals are READ-ONLY from the browser (no INSERT/UPDATE/DELETE privilege).
// A sale is created only by the finalize_sale RPC; an approval only by grant_discount_approval (Admin).

const VARIANT_EMBED = 'variant:product_variants(id, sku, color, ram_gb, storage_gb, mrp, selling_price, is_active, product:products(name, brand:brands(name)))'
const DEVICE_COLUMNS = `id, variant_id, imei1, imei2, serial_number, status, ${VARIANT_EMBED}`
const CUSTOMER_COLUMNS = 'id, name, phone, email, address, notes'

/**
 * Looks a device up by what is printed on it. Exact match on IMEI 1, IMEI 2 or serial number, any status, so the
 * screen can say precisely why a device cannot be sold ("already sold", "damaged"...). `term` must be pre-sanitised.
 */
export const findDeviceByIdentifier = (term: string) =>
  run<SellableDevice[]>(
    supabase.from('inventory_items').select(DEVICE_COLUMNS).or(`imei1.eq.${term},imei2.eq.${term},serial_number.eq.${term.toUpperCase()}`).limit(2) as never,
  )

interface AccessoryRaw {
  id: string
  sku: string
  color: string | null
  mrp: number
  selling_price: number
  is_active: boolean
  product: SellableAccessory['product']
  stock: { on_hand: number } | Array<{ on_hand: number }> | null
}

/** Active quantity SKUs that have stock. */
export async function listSellableAccessories(): Promise<SellableAccessory[]> {
  const rows = await run<AccessoryRaw[]>(
    supabase
      .from('product_variants')
      .select('id, sku, color, mrp, selling_price, is_active, product:products(name, brand:brands(name)), stock:stock_levels(on_hand)')
      .eq('tracking_mode', 'quantity')
      .eq('is_active', true)
      .order('sku')
      .limit(1000) as never,
  )
  return rows
    .map((r) => ({ id: r.id, sku: r.sku, color: r.color, mrp: r.mrp, selling_price: r.selling_price, is_active: r.is_active, product: r.product, on_hand: (Array.isArray(r.stock) ? r.stock[0] : r.stock)?.on_hand ?? 0 }))
    .filter((a) => a.on_hand > 0)
}

/** `term` must be pre-sanitised ([A-Za-z0-9 .+-]). */
export const searchCustomers = (term: string) =>
  run<Customer[]>(supabase.from('customers').select(CUSTOMER_COLUMNS).or(`name.ilike.*${term}*,phone.ilike.*${term}*`).order('name').limit(8))

export interface CustomerInput {
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes?: string | null
}
export const createCustomer = (input: CustomerInput) => run<Customer>(supabase.from('customers').insert(input).select(CUSTOMER_COLUMNS).single())

/** Approvals granted to the signed-in user that are still unused and not expired. */
export const listUsableApprovals = (userId: string) =>
  run<DiscountApproval[]>(
    supabase
      .from('discount_approvals')
      .select('id, requested_for, approved_by, max_amount, reason, expires_at, used_at, used_in_sale_id, created_at')
      .eq('requested_for', userId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at'),
  )

export type SaleLineInput =
  | { inventory_item_id: string; unit_price: number; discount_amount: number }
  | { variant_id: string; quantity: number; unit_price: number; discount_amount: number }

export interface FinalizeSaleInput {
  customerId: string | null
  /** Phones are sold one device per line (quantity is always 1); accessories by variant and quantity. Discount is for the whole line. */
  items: SaleLineInput[]
  payment: { method: PaymentMethod; amount: number; reference?: string }
  notes: string | null
  discountReason: string | null
  approvalId: string | null
}

/** One idempotency key per attempt: reuse it when retrying the identical sale, so the server replays instead of selling twice. */
export const finalizeSale = (input: FinalizeSaleInput, key: string) =>
  run<FinalizeSaleResult>(
    supabase.rpc('finalize_sale', {
      p_idempotency_key: key,
      p_customer_id: input.customerId,
      p_items: input.items,
      p_payment: input.payment,
      p_notes: input.notes,
      p_discount_reason: input.discountReason,
      p_discount_approval_id: input.approvalId,
    }) as never,
  )

export async function listSales(opts: { page: number; term: string }): Promise<{ rows: SaleListRow[]; total: number }> {
  let q = supabase
    .from('invoices')
    .select('id, sale_id, invoice_number, issued_at, customer_name, subtotal, discount_total, grand_total, payments(method), sale:sales(sold_by)', { count: 'exact' })
  if (opts.term) q = q.or(`invoice_number.ilike.*${opts.term}*,customer_name.ilike.*${opts.term}*`)
  const from = (opts.page - 1) * PAGE_SIZE
  const { data, error, count } = await q.order('issued_at', { ascending: false }).order('id').range(from, from + PAGE_SIZE - 1)
  if (error) throw toAppError(error)
  return { rows: (data ?? []) as unknown as SaleListRow[], total: count ?? 0 }
}

export const getInvoiceBySale = (saleId: string) =>
  run<Invoice>(
    supabase
      .from('invoices')
      .select(
        'id, sale_id, invoice_number, issued_at, shop_name, shop_address, customer_name, customer_phone, customer_address, subtotal, discount_total, grand_total,' +
          ' items:invoice_items(id, line_no, description, sku, imei1, imei2, serial_number, quantity, unit_price, discount_amount, line_total),' +
          ' payments(method, amount, reference, received_at),' +
          ' sale:sales(sold_by, sold_at, discount_reason, discount_basis, discount_authorized_by, notes)',
      )
      .eq('sale_id', saleId)
      .single() as never,
  )

// ---- Admin only (the database refuses anyone else)

export const listApprovals = () =>
  run<DiscountApproval[]>(
    supabase
      .from('discount_approvals')
      .select('id, requested_for, approved_by, max_amount, reason, expires_at, used_at, used_in_sale_id, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  )

export interface GrantApprovalInput {
  requestedFor: string
  maxAmount: number
  reason: string
  validMinutes: number
}
export const grantDiscountApproval = (input: GrantApprovalInput, key: string) =>
  run<{ approval_id: string; expires_at: string; replayed: boolean }>(
    supabase.rpc('grant_discount_approval', {
      p_idempotency_key: key,
      p_requested_for: input.requestedFor,
      p_max_amount: input.maxAmount,
      p_reason: input.reason,
      p_valid_minutes: input.validMinutes,
    }) as never,
  )
