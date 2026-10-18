import { supabase } from '../lib/supabase'
import { toAppError } from '../lib/errors'
import type {
  AccessoryRow, AdjustmentReason, AdjustQuantityResult, AdjustStatusResult, CorrectionResult, IdentifierCorrection, InventoryItem,
  InventoryStatus, InventorySummary, StockMovement, VariantLabelInfo,
} from '../lib/types'
import { run } from './db'

// Every read below is allowed to Admin and Manager by row-level security. There is NO direct write to any inventory
// table (no INSERT/UPDATE/DELETE privilege is granted): stock status, quantities and identifiers change only through
// the three RPCs at the bottom of this file.

export const PAGE_SIZE = 25

const VARIANT_EMBED = 'variant:product_variants(sku, color, ram_gb, storage_gb, product:products(name, brand:brands(name)))'
const ITEM_COLUMNS = `id, variant_id, imei1, imei2, serial_number, status, condition, shelf_location, received_at, updated_at, ${VARIANT_EMBED}`
const MOVEMENT_COLUMNS = 'id, movement_type, from_status, to_status, quantity_delta, balance_after, created_by, created_at, adjustment:stock_adjustments(reason, notes)'
const CORRECTION_COLUMNS = 'id, old_imei1, old_imei2, old_serial_number, new_imei1, new_imei2, new_serial_number, reason, corrected_by, created_at'

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query
  if (error) throw toAppError(error)
  return n ?? 0
}

const head = { count: 'exact' as const, head: true }

export async function loadInventorySummary(): Promise<InventorySummary> {
  const byStatus = (s: InventoryStatus) => count(supabase.from('inventory_items').select('id', head).eq('status', s))
  const [inStock, damaged, lost, returnedToSupplier, sold, accessorySkusInStock, levels] = await Promise.all([
    byStatus('in_stock'), byStatus('damaged'), byStatus('lost'), byStatus('returned_to_supplier'), byStatus('sold'),
    count(supabase.from('stock_levels').select('variant_id', head).gt('on_hand', 0)),
    run<Array<{ on_hand: number }>>(supabase.from('stock_levels').select('on_hand').gt('on_hand', 0).limit(1000)),
  ])
  return {
    inStock, damaged, lost, returnedToSupplier, sold, accessorySkusInStock,
    accessoryUnits: levels.reduce((n, l) => n + l.on_hand, 0),
    // the Data API returns at most 1000 rows; beyond that the unit total is a lower bound
    accessoryUnitsTruncated: accessorySkusInStock > levels.length,
  }
}

/** Every variant with its names, for text search over product / brand / model / SKU (a shop catalogue is small). */
export const listVariantIndex = () =>
  run<VariantLabelInfo[]>(
    supabase.from('product_variants').select('id, sku, color, ram_gb, storage_gb, product:products(name, brand:brands(name))').eq('tracking_mode', 'serialized').order('sku').limit(1000) as never,
  )

export interface DeviceQuery {
  page: number
  status: InventoryStatus | ''
  /** Variants whose product / brand / SKU matched the search text (resolved client-side from the index). */
  variantIds: string[]
  /** Sanitised search text, matched against IMEI 1, IMEI 2 and serial number. */
  identifierTerm: string
}

export async function listDevices(q: DeviceQuery): Promise<{ rows: InventoryItem[]; total: number }> {
  let query = supabase.from('inventory_items').select(ITEM_COLUMNS, { count: 'exact' })
  if (q.status) query = query.eq('status', q.status)
  const ors: string[] = []
  if (q.identifierTerm) ors.push(`imei1.ilike.*${q.identifierTerm}*`, `imei2.ilike.*${q.identifierTerm}*`, `serial_number.ilike.*${q.identifierTerm}*`)
  if (q.variantIds.length > 0) ors.push(`variant_id.in.(${q.variantIds.join(',')})`)
  if (ors.length > 0) query = query.or(ors.join(','))
  const from = (q.page - 1) * PAGE_SIZE
  const { data, error, count: total } = await query.order('received_at', { ascending: false }).order('id').range(from, from + PAGE_SIZE - 1)
  if (error) throw toAppError(error)
  return { rows: (data ?? []) as unknown as InventoryItem[], total: total ?? 0 }
}

export const getDevice = (id: string) => run<InventoryItem>(supabase.from('inventory_items').select(ITEM_COLUMNS).eq('id', id).single() as never)

/** Acquisition cost lives in its own table; if the signed-in user may not read it the row is simply absent. */
export const getDeviceCost = (id: string) =>
  run<{ cost_price: number } | null>(supabase.from('inventory_item_costs').select('cost_price').eq('inventory_item_id', id).maybeSingle())

export const listDeviceMovements = (id: string) =>
  run<StockMovement[]>(supabase.from('stock_movements').select(MOVEMENT_COLUMNS).eq('inventory_item_id', id).order('id', { ascending: false }) as never)

export const listDeviceCorrections = (id: string) =>
  run<IdentifierCorrection[]>(supabase.from('inventory_identifier_corrections').select(CORRECTION_COLUMNS).eq('inventory_item_id', id).order('created_at', { ascending: false }))

interface AccessoryRaw {
  id: string
  sku: string
  color: string | null
  is_active: boolean
  product: { name: string; brand: { name: string } | null } | null
  stock: { on_hand: number } | Array<{ on_hand: number }> | null
}
const ACCESSORY_COLUMNS = 'id, sku, color, is_active, product:products(name, brand:brands(name)), stock:stock_levels(on_hand)'
const toAccessory = (r: AccessoryRaw): AccessoryRow => {
  const level = Array.isArray(r.stock) ? r.stock[0] : r.stock
  return { id: r.id, sku: r.sku, color: r.color, is_active: r.is_active, product: r.product, on_hand: level?.on_hand ?? 0 }
}

/** All quantity-tracked variants with their current balance (no stock_levels row yet means 0). */
export async function listAccessories(): Promise<AccessoryRow[]> {
  const rows = await run<AccessoryRaw[]>(
    supabase.from('product_variants').select(ACCESSORY_COLUMNS).eq('tracking_mode', 'quantity').order('sku').limit(1000) as never,
  )
  return rows.map(toAccessory)
}

export async function getAccessory(variantId: string): Promise<AccessoryRow> {
  const row = await run<AccessoryRaw>(
    supabase.from('product_variants').select(ACCESSORY_COLUMNS).eq('id', variantId).eq('tracking_mode', 'quantity').single() as never,
  )
  return toAccessory(row)
}

export const listAccessoryMovements = (variantId: string) =>
  run<StockMovement[]>(
    supabase.from('stock_movements').select(MOVEMENT_COLUMNS).eq('variant_id', variantId).is('inventory_item_id', null).order('id', { ascending: false }).limit(200) as never,
  )

// ---- The only write paths. Each takes one idempotency key per user attempt (see lib/idempotency.ts).

export const adjustDeviceStatus = (itemId: string, reason: AdjustmentReason, notes: string, key: string) =>
  run<AdjustStatusResult>(supabase.rpc('adjust_stock', { p_idempotency_key: key, p_inventory_item_id: itemId, p_reason: reason, p_notes: notes }) as never)

export const adjustAccessoryQuantity = (variantId: string, delta: number, reason: AdjustmentReason, notes: string, key: string) =>
  run<AdjustQuantityResult>(
    supabase.rpc('adjust_quantity_stock', { p_idempotency_key: key, p_variant_id: variantId, p_quantity_delta: delta, p_reason: reason, p_notes: notes }) as never,
  )

export interface IdentifierChanges {
  imei1?: string | null
  imei2?: string | null
  serial_number?: string | null
}

export const correctIdentifiers = (itemId: string, changes: IdentifierChanges, reason: string, key: string) =>
  run<CorrectionResult>(supabase.rpc('correct_item_identifiers', { p_idempotency_key: key, p_inventory_item_id: itemId, p_changes: changes, p_reason: reason }) as never)
