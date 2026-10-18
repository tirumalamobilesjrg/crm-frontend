import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listCustomers, updateCustomer } from '../../api/customers'
import { createCustomer } from '../../api/sales'
import { PAGE_SIZE } from '../../api/inventory'
import { toAppError } from '../../lib/errors'
import type { CustomerRecord } from '../../lib/types'
import { Button, Dialog, ErrorBox, Field, Loading, Pagination, useToast } from '../../components/ui'
import { sanitizeCustomerSearch } from '../pos/logic'
import { EMPTY_CUSTOMER, validateCustomerEdit, type CustomerEditForm } from './logic'

export function CustomerFormDialog({ customer, onClose, onSaved }: { customer: CustomerRecord | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<CustomerEditForm>(
    customer ? { name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '', address: customer.address ?? '', notes: customer.notes ?? '' } : EMPTY_CUSTOMER,
  )
  const [errors, setErrors] = useState<ReturnType<typeof validateCustomerEdit>['errors']>({})
  const set = (k: keyof CustomerEditForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async (v: NonNullable<ReturnType<typeof validateCustomerEdit>['value']>) => {
      if (customer) {
        await updateCustomer(customer.id, v)
        return customer.id
      }
      return (await createCustomer(v)).id
    },
    onSuccess: (id) => {
      notify(customer ? 'Customer saved' : 'Customer added')
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['customer', id] })
      onSaved?.(id)
      onClose()
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateCustomerEdit(form)
    setErrors(found)
    if (value && !save.isPending) save.mutate(value)
  }

  return (
    <Dialog title={customer ? 'Edit customer' : 'New customer'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <div className="grid-2">
          <Field label="Phone" error={errors.phone} hint="A repeat customer is found by this number.">
            {(p) => <input {...p} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
          <Field label="Email" error={errors.email}>
            {(p) => <input {...p} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
        </div>
        <Field label="Address">{(p) => <textarea {...p} rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />}</Field>
        <Field label="Notes" error={errors.notes}>
          {(p) => <textarea {...p} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function CustomersPage() {
  const [params, setParams] = useSearchParams()
  const term = sanitizeCustomerSearch(params.get('q') ?? '')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState(params.get('q') ?? '')
  const [creating, setCreating] = useState(false)
  const list = useQuery({ queryKey: ['customers', { page, term }], queryFn: () => listCustomers({ page, term }), placeholderData: (prev) => prev })

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }

  return (
    <div>
      <div className="page-head">
        <h1>Customers</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New customer
        </Button>
      </div>
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: sanitizeCustomerSearch(draft), page: '' }) }}>
        <input className="search" type="search" aria-label="Search customers" placeholder="Search by name, phone or email" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <>
          <p className="muted" aria-live="polite">
            {list.data.total} {list.data.total === 1 ? 'customer' : 'customers'}
          </p>
          <table className="table" aria-label="Customers">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {term ? 'No customer matches your search.' : 'No customers yet. They are added here or while making a sale.'}
                  </td>
                </tr>
              )}
              {list.data.rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/customers/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.email ?? '—'}</td>
                  <td>{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
      {creating && <CustomerFormDialog customer={null} onClose={() => setCreating(false)} />}
    </div>
  )
}
