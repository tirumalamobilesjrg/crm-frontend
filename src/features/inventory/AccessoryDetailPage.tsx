import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adjustAccessoryQuantity, getAccessory, listAccessoryMovements } from '../../api/inventory'
import { toAppError } from '../../lib/errors'
import { useAttemptKey } from '../../lib/useAttemptKey'
import type { AccessoryRow, AdjustQuantityResult, AdjustmentReason } from '../../lib/types'
import { Badge, Button, Dialog, ErrorBox, Field, Loading, useToast } from '../../components/ui'
import { MovementHistory } from './MovementHistory'
import { quantityReasonOptions, REASON_LABEL, validateQuantityAdjustment, variantTitle, type Direction, type QuantityAdjustForm } from './logic'

function AdjustQuantityDialog({ accessory, onClose }: { accessory: AccessoryRow; onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const attempt = useAttemptKey()
  const [form, setForm] = useState<QuantityAdjustForm>({ direction: 'remove', quantity: '', reason: '', notes: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateQuantityAdjustment>['errors']>({})
  const [confirmed, setConfirmed] = useState<AdjustQuantityResult | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['inventory'] })
    void qc.invalidateQueries({ queryKey: ['accessory', accessory.id] })
    void qc.invalidateQueries({ queryKey: ['pos'] })
    void qc.invalidateQueries({ queryKey: ['reports'] })
  }
  const save = useMutation({
    mutationFn: (v: NonNullable<ReturnType<typeof validateQuantityAdjustment>['value']>) =>
      adjustAccessoryQuantity(accessory.id, v.delta, v.reason, v.notes, attempt.keyFor(JSON.stringify([accessory.id, v.delta, v.reason, v.notes]))),
    onSuccess: (r, v) => {
      attempt.clear()
      setSent(v.delta)
      setConfirmed(r) // the balance reported by the server
      refresh()
    },
    onError: (e) => {
      notify(toAppError(e).message, 'bad')
      refresh() // another sale or adjustment may have changed the balance
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateQuantityAdjustment(form, accessory.on_hand)
    setErrors(found)
    if (value && !save.isPending) save.mutate(value)
  }
  const setDirection = (direction: Direction) => setForm((f) => ({ ...f, direction, reason: quantityReasonOptions(direction).includes(f.reason as AdjustmentReason) ? f.reason : '' }))

  return (
    <Dialog title="Adjust accessory stock" onClose={onClose}>
      {confirmed ? (
        <div>
          <div className="confirmed" role="status">
            Confirmed by the server: {sent !== null && sent > 0 ? '+' : ''}
            {sent} recorded. New balance: <strong>{confirmed.balance_after}</strong>
            {confirmed.replayed ? ' (this request had already been recorded; nothing was repeated)' : ''}.
          </div>
          <div className="dialog-actions">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="muted">
            On hand now: <strong>{accessory.on_hand}</strong>
          </p>
          <fieldset className="radio-row">
            <legend>Change</legend>
            <label>
              <input type="radio" name="direction" checked={form.direction === 'remove'} onChange={() => setDirection('remove')} /> Remove stock
            </label>{' '}
            <label>
              <input type="radio" name="direction" checked={form.direction === 'add'} onChange={() => setDirection('add')} /> Add stock
            </label>
          </fieldset>
          <Field label="Quantity" error={errors.quantity}>
            {(p) => <input {...p} inputMode="numeric" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />}
          </Field>
          <Field label="Reason" error={errors.reason}>
            {(p) => (
              <select {...p} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as AdjustmentReason }))}>
                <option value="">Choose…</option>
                {quantityReasonOptions(form.direction).map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Notes" error={errors.notes} hint="Kept permanently with the stock record.">
            {(p) => <textarea {...p} rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />}
          </Field>
          <div className="dialog-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Record adjustment'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function AccessoryDetailPage() {
  const { id = '' } = useParams()
  const [adjusting, setAdjusting] = useState(false)
  const accessory = useQuery({ queryKey: ['accessory', id], queryFn: () => getAccessory(id) })
  const moves = useQuery({ queryKey: ['inventory', 'accessory-movements', id], queryFn: () => listAccessoryMovements(id) })

  if (accessory.isPending) return <Loading />
  if (accessory.isError) return <ErrorBox error={accessory.error} retry={() => void accessory.refetch()} />
  const a = accessory.data

  return (
    <div>
      <p>
        <Link className="back-link" to="/inventory?tab=accessories">← Inventory</Link>
      </p>
      <div className="page-head">
        <h1>{variantTitle(a)}</h1>
        {a.on_hand > 0 ? <Badge tone="good">In stock</Badge> : <Badge tone="warn">Out of stock</Badge>}
      </div>
      <p className="muted">{a.sku} · accessory, counted by quantity (no IMEI)</p>

      <section className="panel">
        <div className="page-head">
          <h2>Stock</h2>
          <Button onClick={() => setAdjusting(true)}>Adjust stock</Button>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>On hand</dt>
            <dd>{a.on_hand}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Stock movements</h2>
        {moves.isPending && <Loading />}
        {moves.isError && <ErrorBox error={moves.error} retry={() => void moves.refetch()} />}
        {moves.data && <MovementHistory movements={moves.data} quantity />}
      </section>
      {adjusting && <AdjustQuantityDialog accessory={a} onClose={() => setAdjusting(false)} />}
    </div>
  )
}
