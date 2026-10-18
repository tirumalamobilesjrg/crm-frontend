import { describe, expect, it } from 'vitest'
import type { InvoiceRow, LineRow } from '../../api/reports'
import { daysBetween, presetRange, rangeBounds, rupees, summarizeProducts, summarizeProfit, summarizeSales, summarizeStock, toCsv } from './logic'

const inv = (iso: string, total: number, method: 'cash' | 'upi' | 'card' = 'cash', discount = 0): InvoiceRow => ({
  id: iso + total, invoice_number: 'TM/26-27/000001', issued_at: iso, customer_name: 'X', subtotal: total + discount, discount_total: discount, grand_total: total, payments: [{ method }],
})
const line = (sku: string, qty: number, unit: number, disc: number, cost: number | null, shape: 'object' | 'array' = 'object'): LineRow => ({
  quantity: qty, unit_price: unit, discount_amount: disc, line_total: unit * qty - disc,
  variant: { sku, product: { name: sku.toLowerCase(), brand: { name: 'Nova' } } },
  item: cost === null ? null : { cost: shape === 'object' ? { cost_price: cost } : [{ cost_price: cost }] },
})

describe('presetRange (local dates)', () => {
  const now = new Date(2026, 9, 18, 15, 30) // 18 Oct 2026
  it('computes each preset', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-10-18', to: '2026-10-18' })
    expect(presetRange('last7', now)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(presetRange('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-18' })
    expect(presetRange('lastMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('fiscal', now)).toEqual({ from: '2026-04-01', to: '2026-10-18' })
  })
  it('the financial year starts in April, so January belongs to the previous April', () => {
    expect(presetRange('fiscal', new Date(2027, 0, 20))).toEqual({ from: '2026-04-01', to: '2027-01-20' })
    expect(presetRange('lastMonth', new Date(2027, 0, 20))).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
  it('counts days inclusively and bounds both whole days', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1)
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(31)
    const b = rangeBounds('2026-10-01', '2026-10-02')
    expect(new Date(b.toIso).getTime() - new Date(b.fromIso).getTime()).toBe(2 * 86_400_000 - 1)
  })
})

describe('summarizeSales', () => {
  it('totals in paise, averages, groups by payment method and fills empty days with zero', () => {
    const rows = [inv(new Date(2026, 9, 16, 10).toISOString(), 19000, 'cash'), inv(new Date(2026, 9, 16, 15).toISOString(), 1000.5, 'upi', 99.5), inv(new Date(2026, 9, 18, 9).toISOString(), 500, 'cash')]
    const s = summarizeSales(rows, '2026-10-15', '2026-10-18')
    expect(s).toMatchObject({ count: 3, netPaise: 2_050_050, discountPaise: 9_950, subtotalPaise: 2_060_000, granularity: 'day' })
    expect(s.averagePaise).toBe(683_350)
    expect(s.series.map((x) => [x.label, x.count, x.paise])).toEqual([['2026-10-15', 0, 0], ['2026-10-16', 2, 2_000_050], ['2026-10-17', 0, 0], ['2026-10-18', 1, 50_000]])
    expect(s.byMethod).toEqual([{ method: 'cash', count: 2, paise: 1_950_000 }, { method: 'upi', count: 1, paise: 100_050 }])
  })
  it('handles an empty period', () => {
    expect(summarizeSales([], '2026-10-01', '2026-10-03')).toMatchObject({ count: 0, netPaise: 0, averagePaise: 0, byMethod: [] })
  })
  it('switches to months for ranges longer than 62 days and keeps every month, even empty ones', () => {
    const s = summarizeSales([inv(new Date(2026, 5, 10, 12).toISOString(), 100)], '2026-04-01', '2026-10-18')
    expect(s.granularity).toBe('month')
    expect(s.series.map((x) => x.label)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(s.series.find((x) => x.label === '2026-06')).toMatchObject({ count: 1, paise: 10_000 })
  })
  it('does not drift on floating point sums', () => {
    const rows = Array.from({ length: 10 }, (_, i) => inv(new Date(2026, 9, 18, 8, i).toISOString(), 0.1))
    expect(summarizeSales(rows, '2026-10-18', '2026-10-18').netPaise).toBe(100)
  })
})

describe('summarizeProducts and summarizeProfit', () => {
  const lines = [line('NOVA-X1', 1, 19000, 1000, 15000), line('NOVA-X1', 1, 19000, 0, 15000, 'array'), line('CASE', 2, 400, 0, null)]
  it('groups by SKU, largest revenue first', () => {
    expect(summarizeProducts(lines)).toEqual([
      { sku: 'NOVA-X1', name: 'Nova nova-x1', units: 2, revenuePaise: 3_700_000, discountPaise: 100_000 },
      { sku: 'CASE', name: 'Nova case', units: 2, revenuePaise: 80_000, discountPaise: 0 },
    ])
  })
  it('profit counts only costed lines (object or array embeds) and reports the rest separately', () => {
    expect(summarizeProfit(lines)).toEqual({ costedRevenuePaise: 3_700_000, costPaise: 3_000_000, profitPaise: 700_000, costedLines: 2, uncostedLines: 1, uncostedRevenuePaise: 80_000 })
  })
  it('a loss is negative, not hidden', () => {
    expect(summarizeProfit([line('X', 1, 10000, 0, 12000)]).profitPaise).toBe(-200_000)
  })
})

describe('summarizeStock', () => {
  it('values phones at cost and selling price and accessories at selling price only', () => {
    const s = summarizeStock(
      [{ variant: { selling_price: 19000 }, cost: { cost_price: 15000 } }, { variant: { selling_price: 19000 }, cost: [{ cost_price: 15000 }] }, { variant: { selling_price: 9000 }, cost: null }],
      [{ selling_price: 400, stock: { on_hand: 20 } }, { selling_price: 250, stock: [{ on_hand: 4 }] }, { selling_price: 100, stock: null }],
    )
    expect(s).toEqual({ phones: 3, phonesCostPaise: 3_000_000, phonesCostMissing: 1, phonesSellingPaise: 4_700_000, accessoryUnits: 24, accessorySellingPaise: 900_000 })
  })
})

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['two\nlines', 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"two\nlines",3\r\n')
  })
  it('neutralises spreadsheet formulas in text but leaves numbers alone', () => {
    const csv = toCsv(['n'], [['=HYPERLINK("http://evil")'], ['+1'], ['-2'], ['@x'], [-5], ['normal']])
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain("'+1")
    expect(csv).toContain("'-2")
    expect(csv).toContain("'@x")
    expect(csv).toContain('\r\n-5\r\n') // a real negative number is not text
    expect(csv).toContain('normal')
  })
  it('formats rupees from paise', () => {
    expect(rupees(1_234_567)).toBe('12345.67')
  })
})
