import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteCustomer, getCustomer, listCustomerInvoices } from '../../api/customers'
import { useAuth } from '../../auth/AuthProvider'
import { toAppError } from '../../lib/errors'
import { formatINR } from '../../lib/money'
import { Button, ErrorBox, Loading, useToast } from '../../components/ui'
import { CustomerFormDialog } from './CustomersPage'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()
  const { state } = useAuth()
  const isAdmin = state.status === 'ready' && state.profile.role === 'admin'
  const [editing, setEditing] = useState(false)
  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id) })
  const invoices = useQuery({ queryKey: ['customer-invoices', id], queryFn: () => listCustomerInvoices(id) })

  const remove = useMutation({
    mutationFn: () => deleteCustomer(id),
    onSuccess: () => {
      notify('Customer deleted')
      void qc.invalidateQueries({ queryKey: ['customers'] })
      navigate('/customers', { replace: true })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  if (customer.isPending) return <Loading />
  if (customer.isError) return <ErrorBox error={customer.error} retry={() => void customer.refetch()} />
  const c = customer.data
  const spent = (invoices.data ?? []).reduce((n, i) => n + Math.round(i.grand_total * 100), 0) / 100

  return (
    <div>
      <p>
        <Link to="/customers">← Customers</Link>
      </p>
      <div className="page-head">
        <h1>{c.name}</h1>
        <div>
          <Button onClick={() => setEditing(true)}>Edit</Button>{' '}
          {isAdmin && (
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => window.confirm(`Delete ${c.name}? A customer who has bought something cannot be deleted.`) && remove.mutate()}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <section className="panel" aria-label="Customer details">
        <dl className="detail-grid">
          <div><dt>Phone</dt><dd>{c.phone ?? '—'}</dd></div>
          <div><dt>Email</dt><dd>{c.email ?? '—'}</dd></div>
          <div><dt>Address</dt><dd>{c.address ?? '—'}</dd></div>
          <div><dt>Customer since</dt><dd>{new Date(c.created_at).toLocaleDateString()}</dd></div>
          <div><dt>Notes</dt><dd>{c.notes ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <div className="page-head">
          <h2>Purchases</h2>
          <Link className="btn btn-primary" to="/pos">
            New sale
          </Link>
        </div>
        {invoices.isPending && <Loading />}
        {invoices.isError && <ErrorBox error={invoices.error} retry={() => void invoices.refetch()} />}
        {invoices.data && (
          <>
            <p className="muted">
              {invoices.data.length} {invoices.data.length === 1 ? 'invoice' : 'invoices'} · {formatINR(spent)} in total
            </p>
            <table className="table" aria-label="Customer invoices">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th className="right">Discount</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoices.data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No purchases yet.
                    </td>
                  </tr>
                )}
                {invoices.data.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={`/sales/${i.sale_id}`}>{i.invoice_number}</Link>
                    </td>
                    <td>{new Date(i.issued_at).toLocaleString()}</td>
                    <td className="right">{i.discount_total > 0 ? formatINR(i.discount_total) : '—'}</td>
                    <td className="right">{formatINR(i.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      {editing && <CustomerFormDialog customer={c} onClose={() => setEditing(false)} />}
    </div>
  )
}
