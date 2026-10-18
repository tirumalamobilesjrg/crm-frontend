import { toPaise } from '../../lib/money'
import type { PaymentMethod } from '../../lib/types'
import type { InvoiceRow, LineRow, StockAccessoryRow, StockDeviceRow } from '../../api/reports'

// All aggregation happens in integer paise so totals match the invoices exactly.

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export type Preset = 'today' | 'last7' | 'month' | 'lastMonth' | 'fiscal' | 'custom'
export const PRESET_LABEL: Record<Preset, string> = {
  today: 'Today', last7: 'Last 7 days', month: 'This month', lastMonth: 'Last month', fiscal: 'This financial year (April-March)', custom: 'Custom range',
}

/** Calendar dates (YYYY-MM-DD, the shop's local time) for a preset. */
export function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): { from: string; to: string } {
  const today = isoDate(now)
  switch (preset) {
    case 'today': return { from: today, to: today }
    case 'last7': { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: isoDate(d), to: today } }
    case 'month': return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: today }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: isoDate(first), to: isoDate(last) }
    }
    case 'fiscal': { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: today } }
  }
}

/** Instants covering the whole of both days in local time (inclusive). */
export function rangeBounds(from: string, to: string): { fromIso: string; toIso: string } {
  return { fromIso: new Date(`${from}T00:00:00`).toISOString(), toIso: new Date(`${to}T23:59:59.999`).toISOString() }
}

export const daysBetween = (from: string, to: string): number => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1

// ---- sales

export interface SalesSummary {
  count: number
  subtotalPaise: number
  discountPaise: number
  netPaise: number
  averagePaise: number
  byMethod: Array<{ method: PaymentMethod; count: number; paise: number }>
  series: Array<{ label: string; count: number; paise: number }>
  granularity: 'day' | 'month'
}

/** Days when the range is up to 62 days, otherwise months; empty periods are included as zero. */
export function summarizeSales(invoices: InvoiceRow[], from: string, to: string): SalesSummary {
  const granularity = daysBetween(from, to) <= 62 ? 'day' : 'month'
  const key = (iso: string) => (granularity === 'day' ? isoDate(new Date(iso)) : isoDate(new Date(iso)).slice(0, 7))
  const buckets = new Map<string, { count: number; paise: number }>()
  const end = new Date(`${to}T00:00:00`)
  if (granularity === 'day') {
    for (const d = new Date(`${from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) buckets.set(isoDate(d), { count: 0, paise: 0 })
  } else {
    const first = new Date(`${from}T00:00:00`)
    for (const d = new Date(first.getFullYear(), first.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) buckets.set(isoDate(d).slice(0, 7), { count: 0, paise: 0 })
  }

  let subtotal = 0, discount = 0, net = 0
  const methods = new Map<PaymentMethod, { count: number; paise: number }>()
  for (const i of invoices) {
    const total = toPaise(i.grand_total)
    subtotal += toPaise(i.subtotal)
    discount += toPaise(i.discount_total)
    net += total
    const b = buckets.get(key(i.issued_at)) ?? { count: 0, paise: 0 }
    buckets.set(key(i.issued_at), { count: b.count + 1, paise: b.paise + total })
    const m = i.payments[0]?.method
    if (m) { const cur = methods.get(m) ?? { count: 0, paise: 0 }; methods.set(m, { count: cur.count + 1, paise: cur.paise + total }) }
  }
  return {
    count: invoices.length, subtotalPaise: subtotal, discountPaise: discount, netPaise: net,
    averagePaise: invoices.length === 0 ? 0 : Math.round(net / invoices.length),
    byMethod: [...methods.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.paise - a.paise),
    series: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, v]) => ({ label, ...v })),
    granularity,
  }
}

// ---- products and profit

const costOf = (l: LineRow): number | null => {
  const c = l.item?.cost
  const row = Array.isArray(c) ? c[0] : c
  return row ? toPaise(row.cost_price) : null
}

export interface ProductRow { sku: string; name: string; units: number; revenuePaise: number; discountPaise: number }

export function summarizeProducts(lines: LineRow[]): ProductRow[] {
  const by = new Map<string, ProductRow>()
  for (const l of lines) {
    const sku = l.variant?.sku ?? 'unknown'
    const name = [l.variant?.product?.brand?.name, l.variant?.product?.name].filter(Boolean).join(' ') || sku
    const cur = by.get(sku) ?? { sku, name, units: 0, revenuePaise: 0, discountPaise: 0 }
    by.set(sku, { ...cur, units: cur.units + l.quantity, revenuePaise: cur.revenuePaise + toPaise(l.line_total), discountPaise: cur.discountPaise + toPaise(l.discount_amount) })
  }
  return [...by.values()].sort((a, b) => b.revenuePaise - a.revenuePaise || a.sku.localeCompare(b.sku))
}

export interface ProfitSummary {
  costedRevenuePaise: number
  costPaise: number
  profitPaise: number
  costedLines: number
  uncostedLines: number
  uncostedRevenuePaise: number
}

/** Profit only where an acquisition cost is recorded (phones). Accessories have no per-unit cost and are reported separately. */
export function summarizeProfit(lines: LineRow[]): ProfitSummary {
  const s: ProfitSummary = { costedRevenuePaise: 0, costPaise: 0, profitPaise: 0, costedLines: 0, uncostedLines: 0, uncostedRevenuePaise: 0 }
  for (const l of lines) {
    const cost = costOf(l)
    const revenue = toPaise(l.line_total)
    if (cost === null) { s.uncostedLines++; s.uncostedRevenuePaise += revenue; continue }
    s.costedLines++
    s.costedRevenuePaise += revenue
    s.costPaise += cost * l.quantity
  }
  s.profitPaise = s.costedRevenuePaise - s.costPaise
  return s
}

// ---- stock value (now)

export interface StockValue {
  phones: number
  phonesCostPaise: number
  phonesCostMissing: number
  phonesSellingPaise: number
  accessoryUnits: number
  accessorySellingPaise: number
}

export function summarizeStock(devices: StockDeviceRow[], accessories: StockAccessoryRow[]): StockValue {
  const v: StockValue = { phones: devices.length, phonesCostPaise: 0, phonesCostMissing: 0, phonesSellingPaise: 0, accessoryUnits: 0, accessorySellingPaise: 0 }
  for (const d of devices) {
    const c = Array.isArray(d.cost) ? d.cost[0] : d.cost
    if (c) v.phonesCostPaise += toPaise(c.cost_price)
    else v.phonesCostMissing++
    v.phonesSellingPaise += toPaise(d.variant?.selling_price ?? 0)
  }
  for (const a of accessories) {
    const s = Array.isArray(a.stock) ? a.stock[0] : a.stock
    const units = s?.on_hand ?? 0
    v.accessoryUnits += units
    v.accessorySellingPaise += units * toPaise(a.selling_price)
  }
  return v
}

// ---- CSV

/** Cells that a spreadsheet would execute as a formula are neutralised with a leading apostrophe. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export const rupees = (paise: number): string => (paise / 100).toFixed(2)
