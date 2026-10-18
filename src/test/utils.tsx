import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { AuthContext, type AuthState } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import type { StaffProfile, StaffRole } from '../lib/types'
import { vi } from 'vitest'

export const profile = (role: StaffRole, over: Partial<StaffProfile> = {}): StaffProfile => ({
  user_id: '11111111-1111-1111-1111-111111111111',
  full_name: role === 'admin' ? 'Asha Admin' : 'Mohan Manager',
  role,
  phone: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

export const readyState = (role: StaffRole): AuthState => ({
  status: 'ready',
  // only the parts the UI reads
  session: { user: { id: '11111111-1111-1111-1111-111111111111' } } as never,
  profile: profile(role),
})

export function renderApp(ui: ReactElement, opts: { state: AuthState; route?: string; routeState?: unknown; signIn?: () => Promise<void> }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const value = { state: opts.state, signIn: opts.signIn ?? vi.fn().mockResolvedValue(undefined), signOut: vi.fn().mockResolvedValue(undefined) }
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthContext.Provider value={value}>
          <MemoryRouter initialEntries={[{ pathname: opts.route ?? '/', state: opts.routeState }]}>{ui}</MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
