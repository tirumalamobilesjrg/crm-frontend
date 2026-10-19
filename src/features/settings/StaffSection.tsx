import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addStaff, listStaff, updateStaff } from '../../api/settings'
import { useAuth } from '../../auth/AuthProvider'
import { toAppError } from '../../lib/errors'
import type { StaffRole } from '../../lib/types'
import { Badge, Button, Dialog, ErrorBox, Field, Loading, useConfirm, useToast } from '../../components/ui'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function AddDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [userId, setUserId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<StaffRole>('manager')
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: () => addStaff({ user_id: userId.trim(), full_name: name.trim(), role }),
    onSuccess: () => {
      notify('Staff profile added')
      void qc.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!UUID.test(userId.trim())) return setError('Paste the user ID (a UUID) from Supabase → Authentication → Users.')
    if (name.trim() === '') return setError('Enter the person’s name.')
    setError(null)
    add.mutate()
  }
  return (
    <Dialog title="Add staff profile" onClose={onClose}>
      <p className="muted small">
        First create the person’s login in Supabase (Authentication → Users → Add user), then paste their user ID here to give them a role.
      </p>
      <form onSubmit={submit} noValidate>
        <Field label="User ID">{(p) => <input {...p} value={userId} onChange={(e) => setUserId(e.target.value)} />}</Field>
        <Field label="Full name">{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Role">
          {(p) => (
            <select {...p} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          )}
        </Field>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={add.isPending}>
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function StaffSection() {
  const { state } = useAuth()
  const me = state.status === 'ready' ? state.profile.user_id : ''
  const qc = useQueryClient()
  const { notify } = useToast()
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const q = useQuery({ queryKey: ['staff'], queryFn: listStaff })
  const change = useMutation({
    mutationFn: (v: { id: string; patch: { role?: StaffRole; is_active?: boolean } }) => updateStaff(v.id, v.patch),
    onSuccess: () => {
      notify('Saved')
      void qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <p className="muted">Admins manage accounts and roles. Accounts are deactivated, never deleted.</p>
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add staff profile
        </Button>
      </div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox error={q.error} retry={() => void q.refetch()} />}
      {q.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data.map((s) => (
              <tr key={s.user_id}>
                <td>
                  {s.full_name} {s.user_id === me && <Badge>you</Badge>}
                </td>
                <td>
                  <select
                    aria-label={`Role of ${s.full_name}`}
                    value={s.role}
                    onChange={(e) => {
                      const role = e.target.value as StaffRole
                      void confirm({ title: 'Change role', message: `Change ${s.full_name} to ${role}?`, confirmLabel: 'Change role' }).then((ok) => ok && change.mutate({ id: s.user_id, patch: { role } }))
                    }}
                  >
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>{s.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Deactivated</Badge>}</td>
                <td className="right">
                  <Button
                    small
                    onClick={() => {
                      const verb = s.is_active ? 'Deactivate' : 'Reactivate'
                      void confirm({ title: `${verb} staff member`, message: `${verb} ${s.full_name}?`, confirmLabel: verb, danger: s.is_active }).then((ok) => ok && change.mutate({ id: s.user_id, patch: { is_active: !s.is_active } }))
                    }}
                  >
                    {s.is_active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <AddDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
