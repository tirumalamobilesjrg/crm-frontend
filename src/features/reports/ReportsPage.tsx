import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { loadInvoices, loadSoldLines, loadStockAccessories, loadStockDevices } from '../../api/reports'
import { listExpenseAmounts } from '../../api/expenses'
import { formatINR } from '../../lib/money'
import { Button, ErrorBox, Loading } from '../../components/ui'
import { PAYMENT_LABEL } from '../pos/logic'
import { summarizeExpenses } from '../expenses/logic'
import {
  daysBetween, presetRange, PRESET_LABEL, rangeBounds, rupees, summarizeProducts, summarizeProfit, summarizeSales, summarizeStock, toCsv, type Preset,
} from './logic'

const money = (paise: number) => formatINR(paise / 100)

function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function BarChart({ series, granularity }: { series: Array<{ label: string; paise: number }>; granularity: 'day' | 'month' }) {
  const max = Math.max(1, ...series.map((s) => s.paise))
  const w = 640, h = 180, pad = 24
  const bar = (w - pad * 2) / Math.max(1, series.length)
  const total = series.reduce((n, s) => n + s.paise, 0)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Net sales per ${granularity}: ${series.length} ${granularity}s, ${money(total)} in total`} className="chart">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" opacity="0.3" />
      {series.map((s, i) => {
        const bh = Math.round(((h - pad * 2) * s.paise) / max)
        return (
          <rect key={s.label} x={pad + i * bar + bar * 0.1} y={h - pad - bh} width={Math.max(1, bar * 0.8)} height={bh} rx="2" fill="var(--primary)">
            <title>{`${s.label}: ${money(s.paise)}`}</title>
          </rect>
        )
      })}
      <text x={pad} y={h - 6} fontSize="10" fill="currentColor">{series[0]?.label}</text>
      <text x={w - pad} y={h - 6} fontSize="10" textAnchor="end" fill="currentColor">{series[series.length - 1]?.label}</text>
    </svg>
  )
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const preset = (['today', 'last7', 'month', 'lastMonth', 'fiscal', 'custom'].includes(params.get('preset') ?? '') ? params.get('preset') : 'month') as Preset
  const range = useMemo(() => (preset === 'custom' ? { from: params.get('from') ?? presetRange('month').from, to: params.get('to') ?? presetRange('today').to } : presetRange(preset)), [preset, params])
  const rangeProblem = range.from > range.to ? 'The start date must not be after the end date.' : daysBetween(range.from, range.to) > 800 ? 'Choose a range of at most about two years.' : null
  const { fromIso, toIso } = rangeBounds(range.from, range.to)
  const enabled = !rangeProblem

  const invoices = useQuery({ queryKey: ['reports', 'invoices', range], queryFn: () => loadInvoices(fromIso, toIso), enabled })
  const lines = useQuery({ queryKey: ['reports', 'lines', range], queryFn: () => loadSoldLines(fromIso, toIso), enabled })
  const expenses = useQuery({ queryKey: ['reports', 'expenses', range], queryFn: () => listExpenseAmounts({ from: range.from, to: range.to, category: '' }), enabled })
  const devices = useQuery({ queryKey: ['reports', 'stock-devices'], queryFn: loadStockDevices })
  const accessories = useQuery({ queryKey: ['reports', 'stock-accessories'], queryFn: loadStockAccessories })

  const sales = useMemo(() => (invoices.data ? summarizeSales(invoices.data, range.from, range.to) : null), [invoices.data, range])
  const products = useMemo(() => (lines.data ? summarizeProducts(lines.data) : null), [lines.data])
  const profit = useMemo(() => (lines.data ? summarizeProfit(lines.data) : null), [lines.data])
  const spend = useMemo(() => (expenses.data ? summarizeExpenses(expenses.data) : null), [expenses.data])
  const stock = useMemo(() => (devices.data && accessories.data ? summarizeStock(devices.data, accessories.data) : null), [devices.data, accessories.data])

  const set = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }

  return (
    <div>
      <div className="page-head">
        <h1>Reports</h1>
      </div>
      <div className="filters">
        <label className="field">
          <span>Period</span>
          <select value={preset} onChange={(e) => set({ preset: e.target.value, from: '', to: '' })}>
            {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label className="field">
              <span>From</span>
              <input type="date" value={range.from} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={range.to} onChange={(e) => set({ to: e.target.value })} />
            </label>
          </>
        )}
      </div>
      <p className="muted">
        {range.from} to {range.to}
      </p>
      {rangeProblem && <p role="alert" className="field-error">{rangeProblem}</p>}

      <section className="panel" aria-label="Sales summary">
        <div className="page-head">
          <h2>Sales</h2>
          {invoices.data && invoices.data.length > 0 && (
            <Button
              small
              onClick={() =>
                downloadCsv(
                  `sales_${range.from}_to_${range.to}.csv`,
                  toCsv(['Invoice', 'Date', 'Customer', 'Paid by', 'Subtotal', 'Discount', 'Total'],
                    invoices.data.map((i) => [i.invoice_number, i.issued_at.slice(0, 10), i.customer_name, i.payments[0] ? PAYMENT_LABEL[i.payments[0].method] : '', i.subtotal, i.discount_total, i.grand_total])),
                )
              }
            >
              Download sales CSV
            </Button>
          )}
        </div>
        {invoices.isPending && enabled && <Loading />}
        {invoices.isError && <ErrorBox error={invoices.error} retry={() => void invoices.refetch()} />}
        {sales && (
          <>
            <div className="cards">
              <div className="card"><div className="card-num">{sales.count}</div><div>Sales</div></div>
              <div className="card"><div className="card-num">{money(sales.netPaise)}</div><div>Net sales</div></div>
              <div className="card"><div className="card-num">{money(sales.discountPaise)}</div><div>Discounts given</div></div>
              <div className="card"><div className="card-num">{money(sales.averagePaise)}</div><div>Average sale</div></div>
            </div>
            {sales.count === 0 ? (
              <p className="muted">No sales in this period.</p>
            ) : (
              <>
                <BarChart series={sales.series} granularity={sales.granularity} />
                <details>
                  <summary>Show the numbers behind the chart</summary>
                  <table className="table" aria-label={`Sales per ${sales.granularity}`}>
                    <thead><tr><th>{sales.granularity === 'day' ? 'Day' : 'Month'}</th><th className="right">Sales</th><th className="right">Net</th></tr></thead>
                    <tbody>
                      {sales.series.filter((s) => s.count > 0).map((s) => (
                        <tr key={s.label}><td>{s.label}</td><td className="right">{s.count}</td><td className="right">{money(s.paise)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </details>
                <h3>By payment method</h3>
                <table className="table" aria-label="Sales by payment method">
                  <thead><tr><th>Method</th><th className="right">Sales</th><th className="right">Amount</th></tr></thead>
                  <tbody>
                    {sales.byMethod.map((m) => (
                      <tr key={m.method}><td>{PAYMENT_LABEL[m.method]}</td><td className="right">{m.count}</td><td className="right">{money(m.paise)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </section>

      <section className="panel" aria-label="Products sold">
        <div className="page-head">
          <h2>Products sold</h2>
          {products && products.length > 0 && (
            <Button small onClick={() => downloadCsv(`products_${range.from}_to_${range.to}.csv`, toCsv(['SKU', 'Product', 'Units', 'Revenue', 'Discount'], products.map((p) => [p.sku, p.name, p.units, rupees(p.revenuePaise), rupees(p.discountPaise)])))}>
              Download products CSV
            </Button>
          )}
        </div>
        {lines.isPending && enabled && <Loading />}
        {lines.isError && <ErrorBox error={lines.error} retry={() => void lines.refetch()} />}
        {products && (
          <table className="table" aria-label="Products sold table">
            <thead><tr><th>Product</th><th>SKU</th><th className="right">Units</th><th className="right">Revenue</th></tr></thead>
            <tbody>
              {products.length === 0 && <tr><td colSpan={4} className="muted">Nothing sold in this period.</td></tr>}
              {products.slice(0, 20).map((p) => (
                <tr key={p.sku}><td>{p.name}</td><td>{p.sku}</td><td className="right">{p.units}</td><td className="right">{money(p.revenuePaise)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" aria-label="Profit estimate">
        <h2>Profit estimate</h2>
        {(lines.isPending || expenses.isPending) && enabled && <Loading />}
        {profit && spend && (
          <>
            <div className="cards">
              <div className="card"><div className="card-num">{money(profit.profitPaise)}</div><div>Gross profit on phones</div></div>
              <div className="card"><div className="card-num">{money(spend.totalPaise)}</div><div>Expenses recorded</div></div>
              <div className="card"><div className="card-num">{money(profit.profitPaise - spend.totalPaise)}</div><div>Estimated profit</div></div>
            </div>
            <p className="muted">
              This is an estimate. Profit counts only phones, whose purchase cost is recorded per device ({profit.costedLines} {profit.costedLines === 1 ? 'line' : 'lines'}: sales {money(profit.costedRevenuePaise)} minus cost {money(profit.costPaise)}).
              Accessories ({profit.uncostedLines} {profit.uncostedLines === 1 ? 'line' : 'lines'}, {money(profit.uncostedRevenuePaise)} of sales) have no per-unit cost and are not included.
            </p>
          </>
        )}
        {expenses.isError && <ErrorBox error={expenses.error} retry={() => void expenses.refetch()} />}
      </section>

      <section className="panel" aria-label="Stock value">
        <h2>Stock value (now)</h2>
        {(devices.isPending || accessories.isPending) && <Loading />}
        {devices.isError && <ErrorBox error={devices.error} retry={() => void devices.refetch()} />}
        {accessories.isError && <ErrorBox error={accessories.error} retry={() => void accessories.refetch()} />}
        {stock && (
          <>
            <div className="cards">
              <div className="card"><div className="card-num">{stock.phones}</div><div>Phones in stock</div></div>
              <div className="card"><div className="card-num">{money(stock.phonesCostPaise)}</div><div>Phones at cost</div></div>
              <div className="card"><div className="card-num">{money(stock.phonesSellingPaise)}</div><div>Phones at selling price</div></div>
              <div className="card"><div className="card-num">{stock.accessoryUnits}</div><div>Accessory units</div></div>
              <div className="card"><div className="card-num">{money(stock.accessorySellingPaise)}</div><div>Accessories at selling price</div></div>
            </div>
            <p className="muted">
              Accessory cost is not tracked per unit, so accessories are valued at selling price only.
              {stock.phonesCostMissing > 0 && ` ${stock.phonesCostMissing} phone(s) have no recorded cost and count as zero at cost.`}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
