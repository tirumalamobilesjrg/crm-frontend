import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { toAppError } from '../../lib/errors'
import { Button, Field } from '../../components/ui'

export function LoginPage() {
  const { state, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 'noAccess' goes to the guarded area too, which explains why this login cannot be used.
  if (state.status === 'ready' || state.status === 'noAccess') {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-hero" aria-hidden="true">
        <div className="brand">
          <img className="brand-logo" src="/logo-192.png" alt="" width={48} height={48} />
          <span>Tirumala Mobiles</span>
        </div>
        <div>
          <h2>Sell, stock and close the day from one screen.</h2>
          <p>Billing, inventory, purchases and reports for the shop counter.</p>
        </div>
      </section>
      <main className="login-panel">
        <div className="login-card">
          <h1>Tirumala Mobiles CRM</h1>
          <p className="muted">Staff sign in</p>
          <form onSubmit={(e) => void onSubmit(e)} noValidate>
            <Field label="Email">
              {(p) => <input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Field label="Password">
              {(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
            </Field>
            {error && (
              <div className="error-box" role="alert">
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" variant="primary" disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="muted small">Accounts are created by an Admin. There is no self sign-up.</p>
        </div>
      </main>
    </div>
  )
}
