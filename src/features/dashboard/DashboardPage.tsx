import { useMemo } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { countDraftPurchases, loadDashboardCounts } from '../../api/dashboard'
import { listAccessories, loadInventorySummary } from '../../api/inventory'
import { loadInvoices } from '../../api/reports'
import { listSales } from '../../api/sales'
import { useAuth } from '../../auth/AuthProvider'
import { Icon } from '../../components/icons'
import { Badge, EmptyState, ErrorBox, Loading } from '../../components/ui'
import { formatINR } from '../../lib/money'
import { presetRange, rangeBounds, summarizeSales } from '../reports/logic'
import { PAYMENT_LABEL } from '../pos/logic'

const money = (paise: number) => formatINR(paise / 100)
const weekday = (isoDay: string) => new Date(`${isoDay}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })
const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')

/** The week as seven bars; today is marigold. Decorative: the numbers are in the text beside it. */
function WeekStrip({ series }: { series: Array<{ label: string; paise: number }> }) {
  const max = Math.max(1, ...series.map((s) => s.paise))
  return (
    <div className="week" role="img" aria-label={`Net sales for the last 7 days: ${series.map((s) => `${weekday(s.label)} ${money(s.paise)}`).join(', ')}`}>
      {series.map((s, i) => (
        <div className="week-day" key={s.label} data-today={i === series.length - 1}>
          <span className="week-bar" style={{ height: `${Math.max(3, Math.round((s.paise / max) * 100))}%` }} />
          <span>{weekday(s.label)}</span>
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { state } = useAuth()
  const name = state.status === 'ready' ? state.profile.full_name : ''
  const range = useMemo(() => presetRange('last7'), [])
  const counts = useQuery({ queryKey: ['dashboard'], queryFn: loadDashboardCounts })
  const week = useQuery({
    queryKey: ['reports', 'dashboard-week', range],
    queryFn: () => {
      const { fromIso, toIso } = rangeBounds(range.from, range.to)
      return loadInvoices(fromIso, toIso)
    },
  })
  const recent = useQuery({ queryKey: ['sales', 'dashboard-recent'], queryFn: () => listSales({ page: 1, term: '' }) })
  const stock = useQuery({ queryKey: ['inventory', 'summary'], queryFn: loadInventorySummary })
  const accessories = useQuery({ queryKey: ['inventory', 'accessories'], queryFn: listAccessories })
  const drafts = useQuery({ queryKey: ['purchases', 'drafts-count'], queryFn: countDraftPurchases })

  const sales = useMemo(() => (week.data ? summarizeSales(week.data, range.from, range.to) : null), [week.data, range])
  const todayBucket = sales?.series[sales.series.length - 1]
  const todayDiscount = week.data
    ? week.data.filter((i) => new Date(i.issued_at).toDateString() === new Date().toDateString()).reduce((n, i) => n + Math.round(i.discount_total * 100), 0)
    : 0

  const outOfStock = (accessories.data ?? []).filter((a) => a.is_active && a.on_hand === 0).length
  const attention = [
    { show: outOfStock > 0, text: `${outOfStock} accessory ${outOfStock === 1 ? 'SKU is' : 'SKUs are'} out of stock`, to: '/inventory?tab=accessories&stock=out', cta: 'See which' },
    { show: (stock.data?.damaged ?? 0) + (stock.data?.lost ?? 0) > 0, text: `${(stock.data?.damaged ?? 0) + (stock.data?.lost ?? 0)} phones are marked damaged or lost`, to: '/inventory?status=damaged', cta: 'Review' },
    { show: (drafts.data ?? 0) > 0, text: `${drafts.data} draft ${drafts.data === 1 ? 'purchase is' : 'purchases are'} waiting to be received`, to: '/purchasing/purchases', cta: 'Open' },
  ].filter((a) => a.show)
  const attentionReady = accessories.isSuccess && stock.isSuccess && drafts.isSuccess

  return (
    <div>
      <h1>
        Welcome, {name}
      </h1>
      <p className="muted">{greeting(new Date().getHours())}. Here is the counter today.</p>

      <section className="today" aria-label="Today at the counter">
        <div>
          <div className="today-label">Takings today</div>
          {week.isPending && <Loading label="Adding up today…" />}
          {week.isError && <ErrorBox error={week.error} retry={() => void week.refetch()} />}
          {sales && todayBucket && (
            <>
              <div className="today-figure">{money(todayBucket.paise)}</div>
              <div className="today-sub">
                {todayBucket.count === 0 ? 'No sales yet today.' : `${todayBucket.count} ${todayBucket.count === 1 ? 'sale' : 'sales'} today`}
                {todayDiscount > 0 ? `, ${money(todayDiscount)} given as discount.` : todayBucket.count > 0 ? '.' : ''}
              </div>
            </>
          )}
        </div>
        {sales && <WeekStrip series={sales.series} />}
      </section>

      <div className="quick">
        <Link className="btn btn-primary" to="/pos">
          <Icon name="cart" size={18} /> New sale
        </Link>
        <Link className="btn" to="/purchasing/purchases">
          <Icon name="truck" size={18} /> Receive stock
        </Link>
        <Link className="btn" to="/expenses">
          <Icon name="wallet" size={18} /> Add expense
        </Link>
      </div>

      <div className="dash-grid">
        <section className="panel" aria-label="Recent sales">
          <div className="page-head">
            <h2>Recent sales</h2>
            <Link to="/sales">All sales</Link>
          </div>
          {recent.isPending && <Loading />}
          {recent.isError && <ErrorBox error={recent.error} retry={() => void recent.refetch()} />}
          {recent.data && recent.data.rows.length === 0 && (
            <EmptyState icon="receipt" title="No sales yet" action={<Link className="btn btn-primary" to="/pos">Make the first sale</Link>}>
              Sales you complete appear here with their invoice numbers.
            </EmptyState>
          )}
          {recent.data && recent.data.rows.length > 0 && (
            <table className="table" aria-label="Latest invoices">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Paid by</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.data.rows.slice(0, 5).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/sales/${s.sale_id}`}>{s.invoice_number}</Link>
                    </td>
                    <td>{s.customer_name}</td>
                    <td>{s.payments[0] ? PAYMENT_LABEL[s.payments[0].method] : '—'}</td>
                    <td className="right">{formatINR(s.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" aria-label="Needs attention">
          <h2>Needs attention</h2>
          {!attentionReady && <Loading />}
          {attentionReady && attention.length === 0 && (
            <ul className="attention">
              <li className="ok">
                <span className="dot" />
                Nothing needs attention right now.
              </li>
            </ul>
          )}
          {attentionReady && attention.length > 0 && (
            <ul className="attention">
              {attention.map((a) => (
                <li key={a.to}>
                  <span className="dot" />
                  <span>{a.text}</span>
                  <Link to={a.to}>{a.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {counts.isPending && <Loading />}
      {counts.isError && <ErrorBox error={counts.error} retry={() => void counts.refetch()} />}
      {counts.data && (
        <div className="cards" aria-label="Snapshot">
          <div className="card">
            <div className="card-num">{counts.data.products}</div>
            <div>Products</div>
          </div>
          <div className="card">
            <div className="card-num">{counts.data.published}</div>
            <div>Published on website</div>
          </div>
          <div className="card">
            <div className="card-num">{counts.data.devicesInStock}</div>
            <div>Phones in stock</div>
          </div>
          <div className="card">
            <div className="card-num">{counts.data.accessorySkus}</div>
            <div>
              Accessory SKUs <Badge tone="neutral">active</Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
