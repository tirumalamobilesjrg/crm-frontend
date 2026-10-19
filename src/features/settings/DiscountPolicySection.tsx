import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listPolicies, savePolicy } from '../../api/settings'
import { toAppError } from '../../lib/errors'
import type { DiscountPolicy } from '../../lib/types'
import { Badge, Button, ErrorBox, Loading, useToast } from '../../components/ui'
import { validatePolicy, type PolicyForm } from './policyValidation'

const toForm = (p: DiscountPolicy): PolicyForm => ({
  role: p.role,
  can_discount: p.can_discount,
  max_percent: String(p.max_percent),
  max_amount: p.max_amount === null ? '' : String(p.max_amount),
  can_approve: p.can_approve,
})

function PolicyRow({ policy }: { policy: DiscountPolicy }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<PolicyForm>(toForm(policy))
  const [error, setError] = useState<string | null>(null)
  const label = policy.role === 'admin' ? 'Admin' : 'Manager'

  const save = useMutation({
    mutationFn: (p: Parameters<typeof savePolicy>[0]) => savePolicy(p),
    onSuccess: () => {
      notify(`${label} discount policy saved`)
      void qc.invalidateQueries({ queryKey: ['policies'] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit() {
    const { error: problem, value } = validatePolicy(form)
    setError(problem)
    if (value) save.mutate(value)
  }
  const set = <K extends keyof PolicyForm>(k: K, v: PolicyForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <section className="panel" aria-label={`${label} discount policy`}>
      <div className="page-head">
        <h2>{label}</h2>
        {policy.configured_at === null ? <Badge tone="warn">Never reviewed — default values</Badge> : <Badge tone="good">Configured</Badge>}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={form.can_discount}
          onChange={(e) => setForm((f) => (e.target.checked ? { ...f, can_discount: true } : { ...f, can_discount: false, max_percent: '0', max_amount: '', can_approve: false }))}
        />{' '}
        May give discounts without approval
      </label>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`pct-${policy.role}`}>Largest discount per item (% of its price)</label>
          <input id={`pct-${policy.role}`} inputMode="decimal" disabled={!form.can_discount} value={form.max_percent} onChange={(e) => set('max_percent', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`amt-${policy.role}`}>Largest total discount per sale (₹, empty = no cap)</label>
          <input id={`amt-${policy.role}`} inputMode="decimal" disabled={!form.can_discount} value={form.max_amount} onChange={(e) => set('max_amount', e.target.value)} />
        </div>
      </div>
      {policy.role === 'admin' ? (
        <label className="check">
          <input type="checkbox" checked={form.can_approve} disabled={!form.can_discount} onChange={(e) => set('can_approve', e.target.checked)} /> May approve discounts for others
        </label>
      ) : (
        <p className="muted small">Managers can never approve discounts. Above-limit discounts need an Admin approval.</p>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <Button variant="primary" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : `Save ${label} policy`}
      </Button>
    </section>
  )
}

export function DiscountPolicySection() {
  const q = useQuery({ queryKey: ['policies'], queryFn: listPolicies })
  return (
    <div>
      <p className="muted">
        These limits are enforced by the database on every sale. A Manager with no allowance needs an Admin approval for every discount.
      </p>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox error={q.error} retry={() => void q.refetch()} />}
      {q.data?.map((p) => <PolicyRow key={`${p.role}-${p.configured_at}`} policy={p} />)}
    </div>
  )
}
