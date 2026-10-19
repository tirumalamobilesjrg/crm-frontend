import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthProvider'
import type { StaffRole } from '../lib/types'
import { PageLoader } from '../components/ui'

/** Everything inside requires a signed-in, active staff member. Role checks here are UX only; the database enforces them. */
export function RequireAuth() {
  const { state, signOut } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <PageLoader label="Checking your session…" />
  if (state.status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (state.status === 'noAccess') {
    return (
      <main className="center-card" role="alert">
        <h1>No access</h1>
        <p>{state.message}</p>
        <button className="btn" onClick={() => void signOut()}>
          Sign out
        </button>
      </main>
    )
  }
  return <Outlet />
}

export function RequireRole({ roles }: { roles: StaffRole[] }) {
  const { state } = useAuth()
  if (state.status !== 'ready') return null
  if (!roles.includes(state.profile.role)) {
    return (
      <section role="alert" className="panel">
        <h1>Not allowed</h1>
        <p>This page is for {roles.map((r) => (r === 'admin' ? 'Admins' : 'Managers')).join(' and ')} only.</p>
      </section>
    )
  }
  return <Outlet />
}
