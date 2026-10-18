import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { toAppError } from '../lib/errors'
import type { StaffProfile } from '../lib/types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'noAccess'; reason: 'no_profile' | 'inactive' | 'error'; message: string }
  | { status: 'ready'; session: Session; profile: StaffProfile }

interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// The role comes from the staff_profiles table (what the database enforces), never from a token claim.
async function loadState(session: Session | null): Promise<AuthState> {
  if (!session) return { status: 'signedOut' }
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('user_id, full_name, role, phone, is_active, created_at')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (error) return { status: 'noAccess', reason: 'error', message: toAppError(error).message }
  if (!data) return { status: 'noAccess', reason: 'no_profile', message: 'Your login has no staff profile. Ask an Admin to add you.' }
  const profile = data as StaffProfile
  if (!profile.is_active) return { status: 'noAccess', reason: 'inactive', message: 'Your account has been deactivated. Ask an Admin.' }
  return { status: 'ready', session, profile }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const apply = (session: Session | null) => {
      void loadState(session).then((next) => {
        if (!cancelled) setState(next)
      })
    }
    void supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: calling Supabase from inside this callback can deadlock the auth client.
      setTimeout(() => apply(session), 0)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw toAppError(error)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setState({ status: 'signedOut' })
  }, [])

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export { AuthContext }
export type { AuthContextValue }
