import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPurchaseLine,
  cancelPurchase,
  getPurchase,
  listPurchaseLines,
  listVariantOptions,
  receivePurchase,
  removePurchaseLine,
} from '../../api/purchasing'
import { toAppError } from '../../lib/errors'
import { newIdempotencyKey } from '../../lib/idempotency'
import { useStoredValues } from '../../lib/useStoredValues'
import { formatINR } from '../../lib/money'
import type { PurchaseLine } from '../../lib/types'
import { Badge, Button, ErrorBox, Field, Loading, useConfirm, useToast } from '../../components/ui'
import { STATUS_LABEL, STATUS_TONE } from './PurchasesPage'
import { analyseUnits, buildSlots, type ReceiveAnalysis } from './receiving'
import { validateLine, variantLabel, type LineForm } from './validation'

function AddLineForm({ purchaseId }: { purchaseId: string }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const variants = useQuery({ queryKey: ['variant-options'], queryFn: listVariantOptions })
  const [form, setForm] = useState<LineForm>({ variant_id: '', quantity: '1', unitCost: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateLine>['errors']>({})
  const set = <K extends keyof LineForm>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const add = useMutation({
    mutationFn: (v: NonNullable<ReturnType<typeof validateLine>['value']>) => addPurchaseLine({ purchase_id: purchaseId, ...v }),
    onSuccess: () => {
      setForm({ variant_id: '', quantity: '1', unitCost: '' })
      void qc.invalidateQueries({ queryKey: ['purchase-lines', purchaseId] })
      void qc.invalidateQueries({ queryKey: ['purchase', purchaseId] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateLine(form)
    setErrors(found)
    if (value) add.mutate(value)
  }

  return (
    <form onSubmit={submit} noValidate className="grid-3-wide" aria-label="Add purchase line">
      <Field label="Variant" error={errors.variant_id}>
        {(p) => (
          <select {...p} value={form.variant_id} onChange={(e) => set('variant_id', e.target.value)}>
            <option value="">Choose…</option>
            {variants.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {variantLabel(v)} {v.tracking_mode === 'serialized' ? '· phone' : '· accessory'}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Quantity" error={errors.quantity}>
        {(p) => <input {...p} inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />}
      </Field>
      <Field label="Unit cost (₹)" error={errors.unitCost}>
        {(p) => <input {...p} inputMode="decimal" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} />}
      </Field>
      <div className="field">
        <Button type="submit" variant="primary" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add line'}
        </Button>
      </div>
    </form>
  )
}

function UnitBoxes(props: {
  lines: PurchaseLine[]
  slots: ReturnType<typeof buildSlots>
  values: Record<string, string>
  analysis: ReceiveAnalysis
  showMissing: boolean
  onChange: (key: string, value: string) => void
  onSubmit: () => void
}) {
  const container = useRef<HTMLDivElement>(null)

  // Scanners send the code followed by Enter: move to the next empty-or-next box; Enter in the last box submits.
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const inputs = Array.from(container.current?.querySelectorAll<HTMLInputElement>('input[data-unit]') ?? [])
    const next = inputs[inputs.indexOf(e.currentTarget) + 1]
    if (next) next.focus()
    else props.onSubmit()
  }

  return (
    <div ref={container}>
      {props.lines
        .filter((l) => l.variant?.tracking_mode === 'serialized')
        .map((line) => (
          <fieldset key={line.id} className="unit-group">
            <legend>
              {variantLabel({ ...line.variant!, product: line.variant!.product })} · {line.quantity} {line.quantity === 1 ? 'phone' : 'phones'}
            </legend>
            {props.slots
              .filter((s) => s.lineId === line.id)
              .map((slot) => {
                const st = props.analysis.statuses[slot.key]
                const error = st?.error ?? (props.showMissing && !st?.filled ? 'Required' : null)
                const label = `IMEI or serial, phone ${slot.position} of ${line.quantity} (${line.variant?.sku})`
                const errId = `${slot.key}-err`
                return (
                  <div className="unit-row" key={slot.key}>
                    <span className="unit-no">{slot.position}</span>
                    <input
                      data-unit
                      aria-label={label}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? errId : undefined}
                      className={error ? 'input-bad' : st?.filled ? 'input-ok' : undefined}
                      autoComplete="off"
                      spellCheck={false}
                      inputMode="text"
                      placeholder="Scan or type IMEI / serial"
                      value={props.values[slot.key] ?? ''}
                      onChange={(e) => props.onChange(slot.key, e.target.value)}
                      onKeyDown={onKeyDown}
                    />
                    {error && (
                      <small id={errId} className="field-error" role="alert">
                        {error}
                      </small>
                    )}
                  </div>
                )
              })}
          </fieldset>
        ))}
    </div>
  )
}

export function PurchaseDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { notify } = useToast()
  const confirm = useConfirm()
  const purchase = useQuery({ queryKey: ['purchase', id], queryFn: () => getPurchase(id) })
  const lines = useQuery({ queryKey: ['purchase-lines', id], queryFn: () => listPurchaseLines(id) })
  const [values, setValues, clearValues] = useStoredValues(`receive-units:${id}`)
  const [showMissing, setShowMissing] = useState(false)
  // One key per attempt: a retry of the same units reuses it (the server replays instead of duplicating);
  // changing any IMEI makes it a different request, so it gets a fresh key.
  const attempt = useRef<{ signature: string; key: string } | null>(null)

  const slots = useMemo(() => buildSlots(lines.data ?? []), [lines.data])
  const analysis = useMemo(() => analyseUnits(slots, values), [slots, values])

  const removeLine = useMutation({
    mutationFn: removePurchaseLine,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-lines', id] })
      void qc.invalidateQueries({ queryKey: ['purchase', id] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  const cancel = useMutation({
    mutationFn: () => cancelPurchase(id),
    onSuccess: () => {
      notify('Purchase cancelled')
      void qc.invalidateQueries({ queryKey: ['purchase', id] })
      void qc.invalidateQueries({ queryKey: ['purchases'] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  const receive = useMutation({
    mutationFn: () => {
      const signature = JSON.stringify(analysis.units)
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: newIdempotencyKey() }
      return receivePurchase(id, analysis.units, attempt.current.key)
    },
    onSuccess: (r) => {
      attempt.current = null
      clearValues()
      notify(`Stock received: ${r.units_received} phone(s) and ${r.quantity_units_received} accessory unit(s).`)
      void qc.invalidateQueries({ queryKey: ['purchase', id] })
      void qc.invalidateQueries({ queryKey: ['purchase-lines', id] })
      void qc.invalidateQueries({ queryKey: ['purchases'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      // received stock changes what Inventory, the POS and the stock-value report show
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['pos'] })
      void qc.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  if (purchase.isPending || lines.isPending) return <Loading />
  if (purchase.isError) return <ErrorBox error={purchase.error} retry={() => void purchase.refetch()} />
  if (lines.isError) return <ErrorBox error={lines.error} retry={() => void lines.refetch()} />
  const p = purchase.data
  const lineData = lines.data
  const isDraft = p.status === 'draft'
  const accessoryLines = lineData.filter((l) => l.variant?.tracking_mode === 'quantity')

  function submitReceive() {
    if (receive.isPending) return
    if (lineData.length === 0) return notify('Add at least one line before receiving.', 'bad')
    if (!analysis.ready) {
      setShowMissing(true)
      return notify('Fill in every IMEI or serial number and fix the highlighted ones first.', 'bad')
    }
    const phones = analysis.units.length
    const extra = accessoryLines.reduce((n, l) => n + l.quantity, 0)
    void confirm({ title: 'Receive stock', message: `Receive ${phones} phone(s) and ${extra} accessory unit(s) into stock? This cannot be undone.`, confirmLabel: 'Receive stock' }).then((ok) => ok && receive.mutate())
  }

  return (
    <div>
      <p>
        <Link to="/purchasing/purchases">← Purchases</Link>
      </p>
      <div className="page-head">
        <h1>Invoice {p.supplier_invoice_no}</h1>
        <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
      </div>
      <p className="muted">
        {p.supplier?.name} · {p.invoice_date}
        {p.notes ? ` · ${p.notes}` : ''}
      </p>

      <section className="panel">
        <h2>Lines</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Variant</th>
              <th>Stock type</th>
              <th className="right">Qty</th>
              <th className="right">Unit cost</th>
              <th className="right">Line total</th>
              {isDraft && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {lineData.length === 0 && (
              <tr>
                <td colSpan={isDraft ? 6 : 5} className="muted">
                  No lines yet.
                </td>
              </tr>
            )}
            {lineData.map((l) => (
              <tr key={l.id}>
                <td>{l.variant ? variantLabel({ ...l.variant, product: l.variant.product }) : '—'}</td>
                <td>{l.variant?.tracking_mode === 'serialized' ? 'Phone (IMEI)' : 'Accessory'}</td>
                <td className="right">{l.quantity}</td>
                <td className="right">{formatINR(l.unit_cost)}</td>
                <td className="right">{formatINR(l.line_total)}</td>
                {isDraft && (
                  <td className="right">
                    <Button small disabled={removeLine.isPending} onClick={() => removeLine.mutate(l.id)} aria-label={`Remove line ${l.variant?.sku ?? ''}`}>
                      Remove
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4} className="right">
                Total
              </th>
              <th className="right">{formatINR(p.total)}</th>
              {isDraft && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </tfoot>
        </table>
        {isDraft && <AddLineForm purchaseId={id} />}
      </section>

      {isDraft && lineData.length > 0 && (
        <section className="panel">
          <h2>Receive stock</h2>
          {accessoryLines.length > 0 && (
            <p className="muted">Accessories ({accessoryLines.map((l) => `${l.quantity} × ${l.variant?.sku}`).join(', ')}) are received by quantity; nothing to scan.</p>
          )}
          {slots.length > 0 && (
            <>
              <p className="muted">
                Scan or type one IMEI or serial number per phone. Press Enter to move to the next box.{' '}
                <strong>
                  {analysis.filledCount} of {analysis.total} entered
                </strong>
              </p>
              <UnitBoxes
                lines={lineData}
                slots={slots}
                values={values}
                analysis={analysis}
                showMissing={showMissing}
                onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
                onSubmit={submitReceive}
              />
            </>
          )}
          <div className="dialog-actions">
            <Button
              variant="danger"
              disabled={cancel.isPending || receive.isPending}
              onClick={() => void confirm({ title: 'Cancel purchase', message: 'Cancel this draft purchase? Nothing is added to stock.', confirmLabel: 'Cancel purchase', danger: true }).then((ok) => ok && cancel.mutate())}
            >
              Cancel purchase
            </Button>
            <Button variant="primary" disabled={receive.isPending} onClick={submitReceive}>
              {receive.isPending ? 'Receiving…' : 'Receive stock'}
            </Button>
          </div>
        </section>
      )}
      {p.status === 'received' && <p className="muted">Received {p.received_at ? new Date(p.received_at).toLocaleString() : ''}. <Link to="/inventory">Open Inventory</Link> to see the new stock.</p>}
    </div>
  )
}
