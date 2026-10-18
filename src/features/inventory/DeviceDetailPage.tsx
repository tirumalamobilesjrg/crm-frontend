import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adjustDeviceStatus, correctIdentifiers, getDevice, getDeviceCost, listDeviceCorrections, listDeviceMovements } from '../../api/inventory'
import { listStaff } from '../../api/settings'
import { toAppError } from '../../lib/errors'
import { formatINR } from '../../lib/money'
import { useAttemptKey } from '../../lib/useAttemptKey'
import type { AdjustmentReason, AdjustStatusResult, CorrectionResult, InventoryItem } from '../../lib/types'
import { Badge, Button, Dialog, ErrorBox, Field, Loading, useToast } from '../../components/ui'
import { MovementHistory } from './MovementHistory'
import {
  CONDITION_LABEL, deviceReasonOptions, REASON_LABEL, STATUS_LABEL, STATUS_TONE, validateCorrection, validateStatusAdjustment,
  variantTitle, type CorrectionForm, type StatusAdjustForm,
} from './logic'

function refreshDevice(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: ['inventory'] })
  void qc.invalidateQueries({ queryKey: ['device', id] })
}

function AdjustStatusDialog({ device, onClose }: { device: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const attempt = useAttemptKey()
  const options = deviceReasonOptions(device.status)
  const [form, setForm] = useState<StatusAdjustForm>({ reason: '', notes: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateStatusAdjustment>>({})
  const [confirmed, setConfirmed] = useState<AdjustStatusResult | null>(null)

  const save = useMutation({
    mutationFn: () => adjustDeviceStatus(device.id, form.reason as AdjustmentReason, form.notes.trim(), attempt.keyFor(JSON.stringify([device.id, form.reason, form.notes.trim()]))),
    onSuccess: (r) => {
      attempt.clear()
      setConfirmed(r) // what the server says happened, not what we assumed
      refreshDevice(qc, device.id)
    },
    onError: (e) => {
      notify(toAppError(e).message, 'bad')
      refreshDevice(qc, device.id) // the device may have changed under us; show its real status
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const found = validateStatusAdjustment(form, device.status)
    setErrors(found)
    if (Object.keys(found).length === 0 && !save.isPending) save.mutate()
  }

  return (
    <Dialog title="Adjust stock status" onClose={onClose}>
      {confirmed ? (
        <div>
          <div className="confirmed" role="status">
            Confirmed by the server: status changed from <strong>{STATUS_LABEL[confirmed.from_status]}</strong> to <strong>{STATUS_LABEL[confirmed.to_status]}</strong>
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
            Currently <strong>{STATUS_LABEL[device.status]}</strong>. A sold device cannot be adjusted here.
          </p>
          <Field label="Reason" error={errors.reason}>
            {(p) => (
              <select {...p} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as AdjustmentReason }))}>
                <option value="">Choose…</option>
                {options.map((r) => (
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

function CorrectDialog({ device, onClose }: { device: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const attempt = useAttemptKey()
  const [form, setForm] = useState<CorrectionForm>({ imei1: device.imei1 ?? '', imei2: device.imei2 ?? '', serial: device.serial_number ?? '', reason: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateCorrection>['errors']>({})
  const [confirmed, setConfirmed] = useState<CorrectionResult | null>(null)
  const set = (k: keyof CorrectionForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: (changes: NonNullable<ReturnType<typeof validateCorrection>['changes']>) =>
      correctIdentifiers(device.id, changes, form.reason.trim(), attempt.keyFor(JSON.stringify([device.id, changes, form.reason.trim()]))),
    onSuccess: (r) => {
      attempt.clear()
      setConfirmed(r)
      void qc.invalidateQueries({ queryKey: ['device-corrections', device.id] })
      refreshDevice(qc, device.id)
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, changes } = validateCorrection(device, form)
    setErrors(found)
    if (!changes || save.isPending) return
    const summary = Object.keys(changes).join(', ').replace('serial_number', 'serial number')
    if (window.confirm(`Correct the ${summary} of this device? The old values stay in the history and the change is audited.`)) save.mutate(changes)
  }

  return (
    <Dialog title="Correct IMEI / serial" onClose={onClose}>
      {confirmed ? (
        <div>
          <div className="confirmed" role="status">
            Confirmed by the server: the identifiers were corrected{confirmed.replayed ? ' (already recorded earlier; nothing was repeated)' : ''}. The previous values are kept in
            the identifier history below.
          </div>
          <div className="dialog-actions">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="muted">Use this only to fix a mistake made when the phone was received. Leave a field empty to remove that identifier.</p>
          <Field label="IMEI 1" error={errors.imei1}>
            {(p) => <input {...p} className="mono" autoComplete="off" value={form.imei1} onChange={(e) => set('imei1', e.target.value)} />}
          </Field>
          <Field label="IMEI 2" error={errors.imei2}>
            {(p) => <input {...p} className="mono" autoComplete="off" value={form.imei2} onChange={(e) => set('imei2', e.target.value)} />}
          </Field>
          <Field label="Serial number" error={errors.serial}>
            {(p) => <input {...p} className="mono" autoComplete="off" value={form.serial} onChange={(e) => set('serial', e.target.value)} />}
          </Field>
          <Field label="Reason for the correction" error={errors.reason} hint="At least 10 characters. Kept in the audit trail.">
            {(p) => <textarea {...p} rows={3} value={form.reason} onChange={(e) => set('reason', e.target.value)} />}
          </Field>
          <div className="dialog-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save correction'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function DeviceDetailPage() {
  const { id = '' } = useParams()
  const [dialog, setDialog] = useState<'adjust' | 'correct' | null>(null)
  const device = useQuery({ queryKey: ['device', id], queryFn: () => getDevice(id) })
  const cost = useQuery({ queryKey: ['device-cost', id], queryFn: () => getDeviceCost(id) })
  const moves = useQuery({ queryKey: ['inventory', 'device-movements', id], queryFn: () => listDeviceMovements(id) })
  const corrections = useQuery({ queryKey: ['device-corrections', id], queryFn: () => listDeviceCorrections(id) })
  const staff = useQuery({ queryKey: ['staff-names'], queryFn: listStaff, staleTime: 60_000 })

  if (device.isPending) return <Loading />
  if (device.isError) return <ErrorBox error={device.error} retry={() => void device.refetch()} />
  const d = device.data
  const canAdjust = deviceReasonOptions(d.status).length > 0
  const who = (uid: string) => staff.data?.find((s) => s.user_id === uid)?.full_name ?? '—'

  return (
    <div>
      <p>
        <Link to="/inventory">← Inventory</Link>
      </p>
      <div className="page-head">
        <h1>{variantTitle(d.variant)}</h1>
        <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
      </div>
      <p className="muted">{d.variant?.sku} · physical device</p>

      <section className="panel">
        <div className="page-head">
          <h2>Device</h2>
          <div>
            <Button disabled={!canAdjust} title={canAdjust ? undefined : 'A sold or returned device cannot be adjusted here.'} onClick={() => setDialog('adjust')}>
              Adjust status
            </Button>{' '}
            <Button onClick={() => setDialog('correct')}>Correct IMEI / serial</Button>
          </div>
        </div>
        <dl className="detail-grid">
          <div><dt>IMEI 1</dt><dd className="mono">{d.imei1 ?? '—'}</dd></div>
          <div><dt>IMEI 2</dt><dd className="mono">{d.imei2 ?? '—'}</dd></div>
          <div><dt>Serial number</dt><dd className="mono">{d.serial_number ?? '—'}</dd></div>
          <div><dt>Condition</dt><dd>{CONDITION_LABEL[d.condition]}</dd></div>
          <div><dt>Location</dt><dd>{d.shelf_location ?? '—'}</dd></div>
          <div><dt>Received</dt><dd>{new Date(d.received_at).toLocaleDateString()}</dd></div>
          <div>
            <dt>Purchase cost</dt>
            <dd>{cost.isPending ? 'Loading…' : cost.isError ? 'Unavailable' : cost.data ? formatINR(cost.data.cost_price) : 'Not available to you'}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Stock history</h2>
        {moves.isPending && <Loading />}
        {moves.isError && <ErrorBox error={moves.error} retry={() => void moves.refetch()} />}
        {moves.data && <MovementHistory movements={moves.data} quantity={false} />}
      </section>

      <section className="panel">
        <h2>Identifier history</h2>
        {corrections.isPending && <Loading />}
        {corrections.isError && <ErrorBox error={corrections.error} retry={() => void corrections.refetch()} />}
        {corrections.data && corrections.data.length === 0 && <p className="muted">No corrections. These are the identifiers the phone was received with.</p>}
        {corrections.data && corrections.data.length > 0 && (
          <table className="table" aria-label="Identifier corrections">
            <thead>
              <tr>
                <th>When</th>
                <th>Before</th>
                <th>After</th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {corrections.data.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.created_at).toLocaleString()}</td>
                  <td className="mono">{[c.old_imei1, c.old_imei2, c.old_serial_number].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="mono">{[c.new_imei1, c.new_imei2, c.new_serial_number].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{c.reason}</td>
                  <td>{who(c.corrected_by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {dialog === 'adjust' && <AdjustStatusDialog device={d} onClose={() => setDialog(null)} />}
      {dialog === 'correct' && <CorrectDialog device={d} onClose={() => setDialog(null)} />}
    </div>
  )
}
