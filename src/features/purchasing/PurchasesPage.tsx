import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPurchase, listPurchases, listSuppliers } from '../../api/purchasing'
import { toAppError } from '../../lib/errors'
import { formatINR } from '../../lib/money'
import type { PurchaseStatus } from '../../lib/types'
import { Badge, Button, Dialog, ErrorBox, Field, Loading, useToast } from '../../components/ui'
import { todayLocal, validatePurchase, type PurchaseForm } from './validation'

export const STATUS_TONE: Record<PurchaseStatus, 'warn' | 'good' | 'neutral'> = { draft: 'warn', received: 'good', cancelled: 'neutral' }
export const STATUS_LABEL: Record<PurchaseStatus, string> = { draft: 'Draft', received: 'Received', cancelled: 'Cancelled' }

function NewPurchaseDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers })
  const [form, setForm] = useState<PurchaseForm>({ supplier_id: '', invoiceNo: '', invoiceDate: todayLocal(), notes: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validatePurchase>>({})
  const set = <K extends keyof PurchaseForm>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const create = useMutation({
    mutationFn: () =>
      createPurchase({
        supplier_id: form.supplier_id,
        supplier_invoice_no: form.invoiceNo.trim(),
        invoice_date: form.invoiceDate,
        notes: form.notes.trim() === '' ? null : form.notes.trim(),
      }),
    onSuccess: (p) => {
      notify('Draft purchase created. Add its lines next.')
      void qc.invalidateQueries({ queryKey: ['purchases'] })
      navigate(`/purchasing/purchases/${p.id}`)
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const found = validatePurchase(form)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate()
  }

  return (
    <Dialog title="New purchase" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Supplier" error={errors.supplier_id} hint={suppliers.data?.length === 0 ? 'Add a supplier first (Suppliers page).' : undefined}>
          {(p) => (
            <select {...p} value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
              <option value="">Choose…</option>
              {suppliers.data?.filter((s) => s.is_active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid-2">
          <Field label="Supplier invoice number" error={errors.invoiceNo}>
            {(p) => <input {...p} value={form.invoiceNo} maxLength={64} onChange={(e) => set('invoiceNo', e.target.value)} />}
          </Field>
          <Field label="Invoice date" error={errors.invoiceDate}>
            {(p) => <input {...p} type="date" value={form.invoiceDate} onChange={(e) => set('invoiceDate', e.target.value)} />}
          </Field>
        </div>
        <Field label="Notes">{(p) => <textarea {...p} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create draft'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function PurchasesPage() {
  const [creating, setCreating] = useState(false)
  const list = useQuery({ queryKey: ['purchases'], queryFn: listPurchases })
  return (
    <div>
      <div className="page-head">
        <h1>Purchases</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New purchase
        </Button>
      </div>
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Supplier invoice</th>
              <th>Supplier</th>
              <th>Date</th>
              <th className="right">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.data.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No purchases yet.
                </td>
              </tr>
            )}
            {list.data.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/purchasing/purchases/${p.id}`}>{p.supplier_invoice_no}</Link>
                </td>
                <td>{p.supplier?.name}</td>
                <td>{p.invoice_date}</td>
                <td className="right">{formatINR(p.total)}</td>
                <td>
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <NewPurchaseDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
