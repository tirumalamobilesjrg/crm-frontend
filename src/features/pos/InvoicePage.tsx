import { Link, useLocation, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { getInvoiceBySale } from '../../api/sales'
import { listStaff } from '../../api/settings'
import { formatINR } from '../../lib/money'
import { Button, ErrorBox, Loading } from '../../components/ui'
import { PAYMENT_LABEL } from './logic'

/**
 * Read-only view of an issued invoice, laid out for A4 (see the @media print rules in styles.css).
 * It is an internal sale receipt: there is no tax breakdown and no claim to be a statutory tax invoice.
 */
export function InvoicePage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const justSold = Boolean((location.state as { justSold?: boolean } | null)?.justSold)
  const invoice = useQuery({ queryKey: ['sales', 'invoice', id], queryFn: () => getInvoiceBySale(id) })
  const staff = useQuery({ queryKey: ['staff-names'], queryFn: listStaff, staleTime: 60_000 })

  if (invoice.isPending) return <Loading />
  if (invoice.isError) return <ErrorBox error={invoice.error} retry={() => void invoice.refetch()} />
  const inv = invoice.data
  const soldBy = staff.data?.find((s) => s.user_id === inv.sale?.sold_by)?.full_name
  const lines = [...inv.items].sort((a, b) => a.line_no - b.line_no)

  return (
    <div>
      <div className="no-print">
        <p>
          <Link to="/sales">← Sales</Link>
        </p>
        {justSold && (
          <div className="confirmed" role="status">
            Sale completed. Invoice <strong>{inv.invoice_number}</strong> was issued by the server.
          </div>
        )}
        <div className="page-head">
          <h1>Invoice {inv.invoice_number}</h1>
          <div>
            <Button variant="primary" onClick={() => window.print()}>
              Print (A4)
            </Button>{' '}
            <Link className="btn" to="/pos">
              New sale
            </Link>
          </div>
        </div>
      </div>

      <article className="invoice" aria-label={`Invoice ${inv.invoice_number}`}>
        <header className="invoice-head">
          <div>
            <h2>{inv.shop_name}</h2>
            {inv.shop_address && <p>{inv.shop_address}</p>}
          </div>
          <div className="right">
            <h2>INVOICE</h2>
            <p>
              <strong>{inv.invoice_number}</strong>
            </p>
            <p>{new Date(inv.issued_at).toLocaleString()}</p>
          </div>
        </header>

        <section className="invoice-party">
          <h3>Billed to</h3>
          <p>
            <strong>{inv.customer_name}</strong>
          </p>
          {inv.customer_phone && <p>{inv.customer_phone}</p>}
          {inv.customer_address && <p>{inv.customer_address}</p>}
        </section>

        <div className="table-scroll" tabIndex={0} role="region" aria-label="Invoice lines">
        <table className="table invoice-lines" aria-label="Invoice lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th className="right">Qty</th>
              <th className="right">Price</th>
              <th className="right">Discount</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.line_no}</td>
                <td>
                  {l.description}
                  {l.sku && <div className="muted">SKU {l.sku}</div>}
                  {l.imei1 && <div className="mono">IMEI 1: {l.imei1}</div>}
                  {l.imei2 && <div className="mono">IMEI 2: {l.imei2}</div>}
                  {l.serial_number && <div className="mono">Serial: {l.serial_number}</div>}
                </td>
                <td className="right">{l.quantity}</td>
                <td className="right">{formatINR(l.unit_price)}</td>
                <td className="right">{l.discount_amount > 0 ? formatINR(l.discount_amount) : '—'}</td>
                <td className="right">{formatINR(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <dl className="totals invoice-totals">
          <div><dt>Subtotal</dt><dd>{formatINR(inv.subtotal)}</dd></div>
          {inv.discount_total > 0 && <div><dt>Discount</dt><dd>− {formatINR(inv.discount_total)}</dd></div>}
          <div className="grand"><dt>Total</dt><dd>{formatINR(inv.grand_total)}</dd></div>
        </dl>

        <section className="invoice-pay">
          {inv.payments.map((p, i) => (
            <p key={i}>
              Payment received: <strong>{formatINR(p.amount)}</strong> by {PAYMENT_LABEL[p.method]}
              {p.reference ? ` (ref. ${p.reference})` : ''} <span className="muted">· recorded manually</span>
            </p>
          ))}
          {inv.sale?.discount_reason && <p className="muted no-print">Discount reason: {inv.sale.discount_reason}</p>}
          {inv.sale?.notes && <p className="muted no-print">Notes: {inv.sale.notes}</p>}
          {soldBy && <p className="muted">Served by {soldBy}</p>}
        </section>
        <footer className="invoice-foot">This is a sale receipt. It carries no tax breakdown.</footer>
      </article>
    </div>
  )
}
