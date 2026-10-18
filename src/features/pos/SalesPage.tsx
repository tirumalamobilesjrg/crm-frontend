import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { listSales } from '../../api/sales'
import { PAGE_SIZE } from '../../api/inventory'
import { listStaff } from '../../api/settings'
import { formatINR } from '../../lib/money'
import { Button, ErrorBox, Loading, Pagination } from '../../components/ui'
import { sanitizeSearch } from '../inventory/logic'
import { PAYMENT_LABEL } from './logic'

export function SalesPage() {
  const [params, setParams] = useSearchParams()
  const term = sanitizeSearch(params.get('q') ?? '')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState(params.get('q') ?? '')
  const list = useQuery({ queryKey: ['sales', { page, term }], queryFn: () => listSales({ page, term }), placeholderData: (prev) => prev })
  const staff = useQuery({ queryKey: ['staff-names'], queryFn: listStaff, staleTime: 60_000 })

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    update({ q: sanitizeSearch(draft), page: '' })
  }

  return (
    <div>
      <div className="page-head">
        <h1>Sales</h1>
        <Link className="btn btn-primary" to="/pos">
          New sale
        </Link>
      </div>
      <form className="filters" role="search" onSubmit={submit}>
        <input className="search" type="search" aria-label="Search sales" placeholder="Invoice number or customer name" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <>
          <table className="table" aria-label="Sales">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Paid by</th>
                <th>Sold by</th>
                <th className="right">Discount</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {term ? 'No sale matches your search.' : 'No sales yet. Start with “New sale”.'}
                  </td>
                </tr>
              )}
              {list.data.rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/sales/${s.sale_id}`}>{s.invoice_number}</Link>
                  </td>
                  <td>{new Date(s.issued_at).toLocaleString()}</td>
                  <td>{s.customer_name}</td>
                  <td>{s.payments[0] ? PAYMENT_LABEL[s.payments[0].method] : '—'}</td>
                  <td>{staff.data?.find((u) => u.user_id === s.sale?.sold_by)?.full_name ?? '—'}</td>
                  <td className="right">{s.discount_total > 0 ? formatINR(s.discount_total) : '—'}</td>
                  <td className="right">{formatINR(s.grand_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </div>
  )
}
