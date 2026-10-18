import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { grantDiscountApproval, listApprovals } from '../../api/sales'
import { listStaff } from '../../api/settings'
import { useAuth } from '../../auth/AuthProvider'
import { toAppError } from '../../lib/errors'
import { formatINR, parseRupees } from '../../lib/money'
import { useAttemptKey } from '../../lib/useAttemptKey'
import { Badge, Button, ErrorBox, Field, Loading, useToast } from '../../components/ui'

interface ApprovalForm { requestedFor: string; amount: string; reason: string; minutes: string }
type ApprovalErrors = Partial<Record<keyof ApprovalForm, string>>

export function validateApproval(f: ApprovalForm): { errors: ApprovalErrors; value: { requestedFor: string; maxAmount: number; reason: string; validMinutes: number } | null } {
  const errors: ApprovalErrors = {}
  if (!f.requestedFor) errors.requestedFor = 'Choose who the approval is for.'
  const amount = parseRupees(f.amount)
  if (amount === null || amount <= 0) errors.amount = 'Enter the largest total discount you allow, in rupees.'
  if (f.reason.trim().length < 3) errors.reason = 'Give a reason (at least 3 characters).'
  const m = /^\d+$/.test(f.minutes.trim()) ? Number(f.minutes) : NaN
  if (!(m >= 1 && m <= 120)) errors.minutes = 'Valid for 1 to 120 minutes.'
  if (Object.keys(errors).length > 0 || amount === null) return { errors, value: null }
  return { errors, value: { requestedFor: f.requestedFor, maxAmount: amount, reason: f.reason.trim(), validMinutes: m } }
}

/** Admin only (the database refuses anyone else): grant a single-use discount approval to a staff member. */
export function ApprovalsPage() {
  const qc = useQueryClient()
  const { notify } = useToast()
  const { state } = useAuth()
  const attempt = useAttemptKey()
  const me = state.status === 'ready' ? state.profile.user_id : ''
  const staff = useQuery({ queryKey: ['staff-names'], queryFn: listStaff, staleTime: 60_000 })
  const list = useQuery({ queryKey: ['approvals'], queryFn: listApprovals })
  const [form, setForm] = useState<ApprovalForm>({ requestedFor: '', amount: '', reason: '', minutes: '15' })
  const [errors, setErrors] = useState<ApprovalErrors>({})
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const set = (k: keyof ApprovalForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const grant = useMutation({
    mutationFn: (v: NonNullable<ReturnType<typeof validateApproval>['value']>) => grantDiscountApproval(v, attempt.keyFor(JSON.stringify(v))),
    onSuccess: (r) => {
      attempt.clear()
      setConfirmed(`Confirmed by the server: approval granted, valid until ${new Date(r.expires_at).toLocaleTimeString()}.`)
      setForm((f) => ({ ...f, amount: '', reason: '' }))
      void qc.invalidateQueries({ queryKey: ['approvals'] })
    },
    onError: (e) => {
      setConfirmed(null)
      notify(toAppError(e).message, 'bad')
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateApproval(form)
    setErrors(found)
    if (value && !grant.isPending) grant.mutate(value)
  }
  const name = (id: string) => staff.data?.find((s) => s.user_id === id)?.full_name ?? '—'
  const status = (a: { used_at: string | null; expires_at: string }) => (a.used_at ? <Badge>Used</Badge> : new Date(a.expires_at) <= new Date() ? <Badge tone="warn">Expired</Badge> : <Badge tone="good">Active</Badge>)

  return (
    <div>
      <div className="page-head">
        <h1>Discount approvals</h1>
      </div>
      <p className="muted">An approval lets one person give a larger discount on one sale. It can be used once and expires.</p>

      <section className="panel" aria-label="Grant an approval">
        <h2>Grant an approval</h2>
        {confirmed && <div className="confirmed" role="status">{confirmed}</div>}
        <form onSubmit={submit} noValidate>
          <div className="grid-2">
            <Field label="For" error={errors.requestedFor}>
              {(p) => (
                <select {...p} value={form.requestedFor} onChange={(e) => set('requestedFor', e.target.value)}>
                  <option value="">Choose…</option>
                  {staff.data?.filter((s) => s.is_active && s.user_id !== me).map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name} ({s.role})
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Largest total discount (₹)" error={errors.amount}>
              {(p) => <input {...p} inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} />}
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Reason" error={errors.reason}>
              {(p) => <input {...p} value={form.reason} onChange={(e) => set('reason', e.target.value)} />}
            </Field>
            <Field label="Valid for (minutes)" error={errors.minutes}>
              {(p) => <input {...p} inputMode="numeric" value={form.minutes} onChange={(e) => set('minutes', e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={grant.isPending}>
            {grant.isPending ? 'Granting…' : 'Grant approval'}
          </Button>
        </form>
      </section>

      <section className="panel">
        <h2>Recent approvals</h2>
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
        {list.data && (
          <table className="table" aria-label="Approvals">
            <thead>
              <tr>
                <th>For</th>
                <th className="right">Up to</th>
                <th>Reason</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No approvals yet.
                  </td>
                </tr>
              )}
              {list.data.map((a) => (
                <tr key={a.id}>
                  <td>{name(a.requested_for)}</td>
                  <td className="right">{formatINR(a.max_amount)}</td>
                  <td>{a.reason}</td>
                  <td>{new Date(a.expires_at).toLocaleString()}</td>
                  <td>{status(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
