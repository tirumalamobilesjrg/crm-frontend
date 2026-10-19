import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { findDeviceByIdentifier, finalizeSale, listSellableAccessories, listSellableDevices, listUsableApprovals } from '../../api/sales'
import { listPolicies, listStaff } from '../../api/settings'
import { useAuth } from '../../auth/AuthProvider'
import { toAppError } from '../../lib/errors'
import { formatINR } from '../../lib/money'
import { useAttemptKey } from '../../lib/useAttemptKey'
import type { Customer, PaymentMethod } from '../../lib/types'
import { Badge, Button, ErrorBox, Field, Loading, useConfirm, useToast } from '../../components/ui'
import { CustomerPicker } from './CustomerPicker'
import { FindItemBox } from './FindItemBox'
import type { FoundItem } from './findItems'
import {
  accessoryToLine, approvalAuthority, approvalItemLabel, cartTotals, deviceToLine, lineAmounts, ownAuthority, PAYMENT_LABEL, PAYMENT_METHODS, sanitizeIdentifier,
  validateSale, type CartLine, type SaleErrors,
} from './logic'

const money = (paise: number) => formatINR(paise / 100)

export function PosPage() {
  const { state } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()
  const confirm = useConfirm()
  const attempt = useAttemptKey()
  const me = state.status === 'ready' ? state.profile : null

  const [lines, setLines] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [scan, setScan] = useState('')
  const [accessoryChoice, setAccessoryChoice] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [approvalId, setApprovalId] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  // A typed amount only counts for the total it was typed against; when the cart or a discount changes the field follows the new total again.
  const [typedAmount, setTypedAmount] = useState<{ value: string; forTotal: number } | null>(null)
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState<SaleErrors>({})
  const [showErrors, setShowErrors] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  const policies = useQuery({ queryKey: ['policies'], queryFn: listPolicies })
  const staff = useQuery({ queryKey: ['staff-names'], queryFn: listStaff, staleTime: 60_000 })
  const accessories = useQuery({ queryKey: ['pos', 'accessories'], queryFn: listSellableAccessories })
  const devices = useQuery({ queryKey: ['pos', 'devices'], queryFn: listSellableDevices, staleTime: 30_000 })
  const approvals = useQuery({ queryKey: ['pos', 'approvals', me?.user_id], queryFn: () => listUsableApprovals(me!.user_id), enabled: Boolean(me) })

  const policy = policies.data?.find((p) => p.role === me?.role) ?? null
  const approval = approvals.data?.find((a) => a.id === approvalId) ?? null
  const approverPolicy = useMemo(() => {
    if (!approval) return null
    const role = staff.data?.find((s) => s.user_id === approval.approved_by)?.role
    return policies.data?.find((p) => p.role === role) ?? null
  }, [approval, staff.data, policies.data])

  const totals = cartTotals(lines)
  const own = ownAuthority(lines, policy)
  const needsApproval = totals.discountPaise > 0 && !own.allowed
  const effectiveAmount = typedAmount && typedAmount.forTotal === totals.totalPaise ? typedAmount.value : (totals.totalPaise / 100).toFixed(2)

  const form = { lines, customerId: customer?.id ?? null, notes, discountReason: reason, approval, policy, approverPolicy, paymentMethod: method, paymentAmount: effectiveAmount, paymentReference: reference }
  const check = validateSale(form)

  const patch = (key: string, p: Partial<{ unitPrice: string; discount: string; quantity: string }>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? ({ ...l, ...p } as CartLine) : l)))

  async function addByScan(e: FormEvent) {
    e.preventDefault()
    const term = sanitizeIdentifier(scan)
    if (term.length < 4) return setScanError('Scan or type the full IMEI or serial number.')
    setScanning(true)
    setScanError(null)
    try {
      const found = await findDeviceByIdentifier(term)
      const r = deviceToLine(found, term, lines)
      if (r.ok) {
        setLines((ls) => [...ls, r.line])
        setScan('')
      } else setScanError(r.error)
    } catch (err) {
      setScanError(toAppError(err).message)
    } finally {
      setScanning(false)
      scanRef.current?.focus()
    }
  }

  function addAccessory(id: string) {
    const a = accessories.data?.find((x) => x.id === id)
    if (!a) return
    if (lines.some((l) => l.kind === 'accessory' && l.variantId === a.id)) return notify('That accessory is already in the sale. Change its quantity in the cart.', 'bad')
    setLines((ls) => [...ls, accessoryToLine(a)])
    setAccessoryChoice('')
  }

  function addFound(item: FoundItem) {
    setScanError(null)
    if (item.kind === 'accessory') return addAccessory(item.accessory.id)
    const r = deviceToLine([item.device], item.device.imei1 ?? item.device.serial_number ?? '', lines)
    if (r.ok) setLines((ls) => [...ls, r.line])
    else notify(r.error, 'bad')
  }

  const sell = useMutation({
    mutationFn: () => {
      const { payload } = check
      if (!payload) throw new Error('not valid')
      return finalizeSale(payload, attempt.keyFor(JSON.stringify(payload)))
    },
    onSuccess: (r) => {
      attempt.clear()
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['sales'] })
      void qc.invalidateQueries({ queryKey: ['customer-invoices'] }) // the customer's purchase history
      void qc.invalidateQueries({ queryKey: ['reports'] })
      void qc.invalidateQueries({ queryKey: ['pos'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      notify(`Sale completed. Invoice ${r.invoice_number}.`)
      navigate(`/sales/${r.sale_id}`, { state: { justSold: true } })
    },
    onError: (e) => {
      notify(toAppError(e).message, 'bad')
      // stock or an approval may have changed under us: re-read what the screen is based on
      void qc.invalidateQueries({ queryKey: ['pos'] })
    },
  })

  function complete() {
    setShowErrors(true)
    setErrors(check.errors)
    if (!check.payload || sell.isPending) return
    void confirm({ title: 'Complete sale', message: `Complete this sale of ${money(totals.totalPaise)} paid by ${PAYMENT_LABEL[method as PaymentMethod]}? The invoice cannot be edited afterwards.`, confirmLabel: 'Complete sale' }).then((ok) => ok && sell.mutate())
  }

  const shown = showErrors ? { ...check.errors, ...errors } : {}
  const usable = (approvals.data ?? []).filter((a) => approvalAuthority(lines, a, null, policy).allowed || a.id === approvalId)

  if (policies.isPending) return <Loading />
  if (policies.isError) return <ErrorBox error={policies.error} retry={() => void policies.refetch()} />

  return (
    <div>
      <div className="page-head">
        <h1>New sale</h1>
      </div>

      <div className="pos-grid">
        <div>
          <section className="panel" aria-label="Add items">
            <h2>Add items</h2>
            <FindItemBox
              devices={devices.data ?? []}
              accessories={accessories.data ?? []}
              cart={lines}
              loading={devices.isPending || accessories.isPending}
              failed={devices.isError}
              onPick={addFound}
            />
            <form onSubmit={(e) => void addByScan(e)} className="inline-form">
              <Field label="Scan IMEI or serial number" error={scanError ?? undefined}>
                {(p) => (
                  <input {...p} ref={scanRef} className="mono" autoComplete="off" autoFocus placeholder="Scan the phone's IMEI" value={scan} onChange={(e) => setScan(e.target.value)} />
                )}
              </Field>
              <Button type="submit" variant="primary" disabled={scanning}>
                {scanning ? 'Looking up…' : 'Add phone'}
              </Button>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); addAccessory(accessoryChoice) }} className="inline-form">
              <Field label="Accessory" hint={accessories.isError ? undefined : 'Accessories are sold by quantity.'} error={accessories.isError ? toAppError(accessories.error).message : undefined}>
                {(p) => (
                  <select {...p} value={accessoryChoice} onChange={(e) => setAccessoryChoice(e.target.value)}>
                    <option value="">{accessories.isPending ? 'Loading…' : 'Choose an accessory in stock…'}</option>
                    {accessories.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.product?.name} {a.color ?? ''} ({a.sku}) · {a.on_hand} in stock · {formatINR(a.selling_price)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Button type="submit" disabled={!accessoryChoice}>
                Add accessory
              </Button>
            </form>
          </section>

          <section className="panel" aria-label="Cart">
            <h2>Cart</h2>
            {shown.cart && <p role="alert" className="field-error">{shown.cart}</p>}
            {lines.length === 0 ? (
              <p className="muted">Nothing added yet. Scan a phone or choose an accessory.</p>
            ) : (
              <table className="table" aria-label="Sale lines">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price (₹)</th>
                    <th>Discount (₹)</th>
                    <th className="right">Line total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const a = lineAmounts(l)
                    const errs = showErrors ? check.lineErrors[l.key] ?? {} : a.errors
                    return (
                      <tr key={l.key}>
                        <td>
                          {l.title}
                          <div className="muted mono">{l.kind === 'device' ? l.identifier : l.sku}</div>
                          <div className="muted">MRP {formatINR(l.mrp)}</div>
                        </td>
                        <td>
                          {l.kind === 'device' ? (
                            1
                          ) : (
                            <input aria-label={`Quantity for ${l.sku}`} className="narrow" inputMode="numeric" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} aria-invalid={Boolean(errs.quantity)} />
                          )}
                          {errs.quantity && <small className="field-error" role="alert">{errs.quantity}</small>}
                        </td>
                        <td>
                          <input aria-label={`Unit price for ${l.sku}`} className="narrow" inputMode="decimal" value={l.unitPrice} onChange={(e) => patch(l.key, { unitPrice: e.target.value })} aria-invalid={Boolean(errs.unitPrice)} />
                          {errs.unitPrice && <small className="field-error" role="alert">{errs.unitPrice}</small>}
                        </td>
                        <td>
                          <input aria-label={`Discount for ${l.sku}`} className="narrow" inputMode="decimal" placeholder="0" value={l.discount} onChange={(e) => patch(l.key, { discount: e.target.value })} aria-invalid={Boolean(errs.discount)} />
                          {errs.discount && <small className="field-error" role="alert">{errs.discount}</small>}
                        </td>
                        <td className="right">{money(a.netPaise)}</td>
                        <td className="right">
                          <Button small onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.sku}`}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div>
          <CustomerPicker customer={customer} onChange={setCustomer} />

          <section className="panel" aria-label="Totals and discount">
            <h2>Total</h2>
            <dl className="totals">
              <div><dt>Subtotal</dt><dd>{money(totals.subtotalPaise)}</dd></div>
              <div><dt>Discount</dt><dd>− {money(totals.discountPaise)}</dd></div>
              <div className="grand"><dt>To pay</dt><dd>{money(totals.totalPaise)}</dd></div>
            </dl>
            <p className="muted">No GST is calculated. Prices are plain selling prices.</p>

            {totals.discountPaise > 0 && (
              <>
                <p>
                  {own.allowed ? (
                    <Badge tone="good">Within your discount limit</Badge>
                  ) : (
                    <Badge tone="warn">Needs an Admin approval</Badge>
                  )}{' '}
                  {!own.allowed && own.why}
                </p>
                <Field label="Reason for the discount" error={shown.reason}>
                  {(p) => <input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
                </Field>
                {(needsApproval || approvalId) && (
                  <Field label="Discount approval" error={shown.discount} hint={approvals.data?.length === 0 ? 'You have no unused approval. Ask an Admin to grant one for this item.' : 'An approval works only for the item it was granted for.'}>
                    {(p) => (
                      <select {...p} value={approvalId} onChange={(e) => setApprovalId(e.target.value)}>
                        <option value="">No approval</option>
                        {usable.map((a) => (
                          <option key={a.id} value={a.id}>
                            {approvalItemLabel(a)}: up to {formatINR(a.max_amount)} · {a.reason} · expires {new Date(a.expires_at).toLocaleTimeString()}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
                {!needsApproval && !approvalId && shown.discount && <p role="alert" className="field-error">{shown.discount}</p>}
              </>
            )}
          </section>

          <section className="panel" aria-label="Payment">
            <h2>Payment received</h2>
            <p className="muted">Recorded manually. One payment per sale, equal to the total.</p>
            <Field label="Paid by" error={shown.method}>
              {(p) => (
                <select {...p} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  <option value="">Choose…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABEL[m]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Amount received (₹)" error={shown.payment}>
              {(p) => <input {...p} inputMode="decimal" value={effectiveAmount} onChange={(e) => setTypedAmount({ value: e.target.value, forTotal: totals.totalPaise })} />}
            </Field>
            <Field label="Reference (optional)" hint="UPI transaction id, cheque number…">
              {(p) => <input {...p} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />}
            </Field>
            <Field label="Notes (optional)">{(p) => <textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
            <Button variant="primary" onClick={complete} disabled={sell.isPending}>
              {sell.isPending ? 'Completing…' : 'Complete sale'}
            </Button>
          </section>
        </div>
      </div>
    </div>
  )
}
