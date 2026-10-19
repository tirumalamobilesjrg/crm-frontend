import { toPaise } from '../../lib/money'
import type { PaymentMethod } from '../../lib/types'
import type { InvoiceRow, LineRow, StockAccessoryRow, StockDeviceRow } from '../../api/reports'

// All aggregation happens in integer paise so totals match the invoices exactly.

// The shop works in Indian time. Day boundaries, "today", the financial year and the CSV date all use IST, whatever the
// clock or time zone of the device that opens the report (a laptop set to UTC must not shift a sale to the wrong day).
export const SHOP_TIME_ZONE = 'Asia/Kolkata'
const shopDay = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
/** The shop's calendar date (YYYY-MM-DD, IST) of an instant. */
export const shopDate = (d: Date): string => shopDay.format(d)
export const isoDate = shopDate
const utcMs = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
/** Calendar arithmetic on YYYY-MM-DD strings, free of any time zone. */
export const addDays = (iso: string, n: number): string => new Date(utcMs(iso) + n * 86_400_000).toISOString().slice(0, 10)
const monthStartOf = (iso: string): string => `${iso.slice(0, 7)}-01`

export type Preset = 'today' | 'last7' | 'month' | 'lastMonth' | 'fiscal' | 'custom'
export const PRESET_LABEL: Record<Preset, string> = {
  today: 'Today', last7: 'Last 7 days', month: 'This month', lastMonth: 'Last month', fiscal: 'This financial year (April-March)', custom: 'Custom range',
}

/** Calendar dates (YYYY-MM-DD, the shop's local time) for a preset. */
export function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): { from: string; to: string } {
  const today = shopDate(now)
  switch (preset) {
    case 'today': return { from: today, to: today }
    case 'last7': return { from: addDays(today, -6), to: today }
    case 'month': return { from: monthStartOf(today), to: today }
    case 'lastMonth': { const thisMonth = monthStartOf(today); return { from: monthStartOf(addDays(thisMonth, -1)), to: addDays(thisMonth, -1) } }
    case 'fiscal': { const y = Number(today.slice(0, 4)); const fy = Number(today.slice(5, 7)) >= 4 ? y : y - 1; return { from: `${fy}-04-01`, to: today } }
  }
}

/** Instants covering the whole of both days in Indian time (inclusive). */
export function rangeBounds(from: string, to: string): { fromIso: string; toIso: string } {
  return { fromIso: new Date(`${from}T00:00:00+05:30`).toISOString(), toIso: new Date(`${to}T23:59:59.999+05:30`).toISOString() }
}

export const daysBetween = (from: string, to: string): number => Math.round((utcMs(to) - utcMs(from)) / 86_400_000) + 1

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
  const key = (iso: string) => (granularity === 'day' ? shopDate(new Date(iso)) : shopDate(new Date(iso)).slice(0, 7))
  const buckets = new Map<string, { count: number; paise: number }>()
  if (granularity === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) buckets.set(d, { count: 0, paise: 0 })
  } else {
    for (let m = monthStartOf(from); m <= to; m = addDays(m.slice(0, 7) + '-28', 4).slice(0, 7) + '-01') buckets.set(m.slice(0, 7), { count: 0, paise: 0 })
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
