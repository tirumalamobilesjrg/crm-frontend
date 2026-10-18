import { supabase } from '../lib/supabase'
import { fetchAll } from './db'
import type { PaymentMethod } from '../lib/types'

// Reports are computed in the browser from tables both roles may read (there is no server-side aggregation).
// fetchAll pages through the Data API and refuses past 20,000 rows instead of silently truncating a total.

export interface InvoiceRow {
  id: string
  invoice_number: string
  issued_at: string
  customer_name: string
  subtotal: number
  discount_total: number
  grand_total: number
  payments: Array<{ method: PaymentMethod }>
}

export interface LineRow {
  quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
  variant: { sku: string; product: { name: string; brand: { name: string } | null } | null } | null
  item: { cost: { cost_price: number } | Array<{ cost_price: number }> | null } | null
}

export interface StockDeviceRow {
  variant: { selling_price: number } | null
  cost: { cost_price: number } | Array<{ cost_price: number }> | null
}

export interface StockAccessoryRow {
  selling_price: number
  stock: { on_hand: number } | Array<{ on_hand: number }> | null
}

export const loadInvoices = (fromIso: string, toIso: string) =>
  fetchAll<InvoiceRow>(
    (from, to) =>
      supabase
        .from('invoices')
        .select('id, invoice_number, issued_at, customer_name, subtotal, discount_total, grand_total, payments(method)')
        .gte('issued_at', fromIso)
        .lte('issued_at', toIso)
        .order('issued_at')
        .order('id')
        .range(from, to) as never,
  )

export const loadSoldLines = (fromIso: string, toIso: string) =>
  fetchAll<LineRow>(
    (from, to) =>
      supabase
        .from('sale_items')
        .select(
          'quantity, unit_price, discount_amount, line_total, variant:product_variants(sku, product:products(name, brand:brands(name))), item:inventory_items(cost:inventory_item_costs(cost_price)), sale:sales!inner(sold_at)',
        )
        .gte('sale.sold_at', fromIso)
        .lte('sale.sold_at', toIso)
        .order('id')
        .range(from, to) as never,
  )

export const loadStockDevices = () =>
  fetchAll<StockDeviceRow>(
    (from, to) =>
      supabase
        .from('inventory_items')
        .select('variant:product_variants(selling_price), cost:inventory_item_costs(cost_price)')
        .eq('status', 'in_stock')
        .order('id')
        .range(from, to) as never,
  )

export const loadStockAccessories = () =>
  fetchAll<StockAccessoryRow>(
    (from, to) =>
      supabase
        .from('product_variants')
        .select('selling_price, stock:stock_levels(on_hand)')
        .eq('tracking_mode', 'quantity')
        .order('id')
        .range(from, to) as never,
  )
