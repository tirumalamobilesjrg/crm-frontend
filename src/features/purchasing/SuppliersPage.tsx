import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSupplier, listSuppliers, setSupplierActive } from '../../api/purchasing'
import { toAppError } from '../../lib/errors'
import { Badge, Button, Dialog, ErrorBox, Field, Loading, useToast } from '../../components/ui'
import { validateSupplier, type SupplierForm } from './validation'

const EMPTY: SupplierForm = { name: '', phone: '', email: '', address: '', notes: '' }
const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

function NewSupplierDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<SupplierForm>(EMPTY)
  const [errors, setErrors] = useState<ReturnType<typeof validateSupplier>>({})
  const set = <K extends keyof SupplierForm>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const create = useMutation({
    mutationFn: () =>
      createSupplier({ name: form.name.trim(), phone: orNull(form.phone), email: orNull(form.email), address: orNull(form.address), notes: orNull(form.notes) }),
    onSuccess: () => {
      notify('Supplier added')
      void qc.invalidateQueries({ queryKey: ['suppliers'] })
      onClose()
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const found = validateSupplier(form)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate()
  }

  return (
    <Dialog title="New supplier" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Supplier name" error={errors.name}>
          {(p) => <input {...p} value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <div className="grid-2">
          <Field label="Phone">{(p) => <input {...p} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}</Field>
          <Field label="Email" error={errors.email}>
            {(p) => <input {...p} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
        </div>
        <Field label="Address">{(p) => <textarea {...p} rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />}</Field>
        <Field label="Notes">{(p) => <textarea {...p} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add supplier'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function SuppliersPage() {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [adding, setAdding] = useState(false)
  const list = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers })

  const toggle = useMutation({
    mutationFn: (v: { id: string; value: boolean }) => setSupplierActive(v.id, v.value),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <h1>Suppliers</h1>
        <Button variant="primary" onClick={() => setAdding(true)}>
          New supplier
        </Button>
      </div>
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.data.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No suppliers yet. Add one before recording a purchase.
                </td>
              </tr>
            )}
            {list.data.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.phone ?? '—'}</td>
                <td>{s.email ?? '—'}</td>
                <td>{s.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Inactive</Badge>}</td>
                <td className="right">
                  <Button small disabled={toggle.isPending} onClick={() => toggle.mutate({ id: s.id, value: !s.is_active })}>
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <NewSupplierDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
