import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { listAudit } from '../../api/audit'
import { PAGE_SIZE } from '../../api/inventory'
import { listStaff } from '../../api/settings'
import { Button, ErrorBox, Loading, Pagination } from '../../components/ui'
import { sanitizeSearch } from '../inventory/logic'

/** Admin only. A read-only view of the append-only audit trail. */
export function AuditPage() {
  const [params, setParams] = useSearchParams()
  const action = sanitizeSearch(params.get('action') ?? '')
  const table = sanitizeSearch(params.get('table') ?? '')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState({ action: params.get('action') ?? '', table: params.get('table') ?? '' })
  const list = useQuery({ queryKey: ['audit', { page, action, table }], queryFn: () => listAudit({ page, action, table }), placeholderData: (prev) => prev })
  const staff = useQuery({ queryKey: ['staff-names'], queryFn: listStaff, staleTime: 60_000 })

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    update({ action: sanitizeSearch(draft.action), table: sanitizeSearch(draft.table), page: '' })
  }
  const who = (id: string | null) => (id ? staff.data?.find((s) => s.user_id === id)?.full_name ?? 'Unknown' : 'System')

  return (
    <div>
      <div className="page-head">
        <h1>Audit log</h1>
      </div>
      <p className="muted">Every sensitive action is recorded here and cannot be edited or deleted.</p>
      <form className="filters" role="search" onSubmit={submit}>
        <input className="search" aria-label="Filter by action" placeholder="Action, e.g. sale, stock, identifier" value={draft.action} onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))} />
        <input aria-label="Filter by table" placeholder="Table, e.g. sales" value={draft.table} onChange={(e) => setDraft((d) => ({ ...d, table: e.target.value }))} />
        <Button type="submit">Filter</Button>
      </form>
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <>
          <table className="table" aria-label="Audit entries">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No entries match.
                  </td>
                </tr>
              )}
              {list.data.rows.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.occurred_at).toLocaleString()}</td>
                  <td>
                    {who(a.actor_id)} {a.actor_role && <span className="muted">({a.actor_role})</span>}
                  </td>
                  <td>{a.action}</td>
                  <td className="mono">{a.table_name ?? '—'}</td>
                  <td>
                    {a.detail ? (
                      <details>
                        <summary>View</summary>
                        <pre className="mono">{JSON.stringify(a.detail, null, 2)}</pre>
                      </details>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </div>
  )
}
