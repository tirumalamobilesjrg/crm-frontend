import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createCustomer, searchCustomers } from '../../api/sales'
import { toAppError } from '../../lib/errors'
import { useDebounced } from '../../lib/useDebounced'
import type { Customer } from '../../lib/types'
import { Button, Dialog, Field, useToast } from '../../components/ui'
import { sanitizeCustomerSearch, validateCustomer, type CustomerForm } from './logic'

function NewCustomerDialog({ onCreated, onClose }: { onCreated: (c: Customer) => void; onClose: () => void }) {
  const { notify } = useToast()
  const [form, setForm] = useState<CustomerForm>({ name: '', phone: '', email: '', address: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateCustomer>['errors']>({})
  const create = useMutation({
    mutationFn: (v: NonNullable<ReturnType<typeof validateCustomer>['value']>) => createCustomer(v),
    onSuccess: (c) => {
      notify('Customer added')
      onCreated(c)
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })
  const set = (k: keyof CustomerForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateCustomer(form)
    setErrors(found)
    if (value && !create.isPending) create.mutate(value)
  }
  return (
    <Dialog title="New customer" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label="Phone" error={errors.phone} hint="Optional. A repeat customer is found by this number.">
          {(p) => <input {...p} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => <input {...p} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
        </Field>
        <Field label="Address">{(p) => <textarea {...p} rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />}</Field>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add customer'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Optional: a sale without a customer is a walk-in sale. */
export function CustomerPicker({ customer, onChange }: { customer: Customer | null; onChange: (c: Customer | null) => void }) {
  const [text, setText] = useState('')
  const [creating, setCreating] = useState(false)
  const term = sanitizeCustomerSearch(useDebounced(text))
  const results = useQuery({ queryKey: ['customers', term], queryFn: () => searchCustomers(term), enabled: term.length >= 2 && !customer })

  return (
    <section className="panel" aria-label="Customer">
      <div className="page-head">
        <h2>Customer</h2>
        {!customer && (
          <Button small onClick={() => setCreating(true)}>
            New customer
          </Button>
        )}
      </div>
      {customer ? (
        <p>
          <strong>{customer.name}</strong> {customer.phone ?? ''}{' '}
          <Button small onClick={() => onChange(null)}>
            Change
          </Button>
        </p>
      ) : (
        <>
          <p className="muted">Walk-in customer unless you pick one.</p>
          <input type="search" aria-label="Search customers" placeholder="Search by name or phone" value={text} onChange={(e) => setText(e.target.value)} />
          {results.isError && <p role="alert" className="field-error">{toAppError(results.error).message}</p>}
          {results.data && results.data.length === 0 && <p className="muted">No customer found. Use “New customer”.</p>}
          {results.data && results.data.length > 0 && (
            <ul className="pick-list" aria-label="Matching customers">
              {results.data.map((c) => (
                <li key={c.id}>
                  <button type="button" className="btn btn-small" onClick={() => { onChange(c); setText('') }}>
                    {c.name} {c.phone ? `· ${c.phone}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {creating && <NewCustomerDialog onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); onChange(c) }} />}
    </section>
  )
}
