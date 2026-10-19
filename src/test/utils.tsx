import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
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

/** '/inventory?tab=accessories' -> { pathname, search } (MemoryRouter does not split a query out of pathname). */
const splitRoute = (route: string) => {
  const i = route.indexOf('?')
  return i < 0 ? { pathname: route } : { pathname: route.slice(0, i), search: route.slice(i) }
}

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
          <MemoryRouter initialEntries={[{ ...splitRoute(opts.route ?? '/'), state: opts.routeState }]}>{ui}</MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

/** Messages shown by the in-app confirmation dialog since the last autoConfirm() call. */
export const confirmLog: string[] = []
let declines = 0
let watching = false

/** Make the next confirmation dialog answer "Cancel" instead of confirming. */
export function declineNextConfirm() {
  declines++
}

/**
 * Answer every in-app confirmation dialog automatically (confirm by default) and record its message in `confirmLog`, so a test
 * can assert what the user was asked. Call from beforeEach; the dialog itself is covered by ui.test.tsx.
 */
export function autoConfirm() {
  confirmLog.length = 0
  declines = 0
  if (watching) return
  watching = true
  new MutationObserver(() => {
    const dialog = document.querySelector('.confirm-dialog')
    if (!dialog || dialog.hasAttribute('data-answered')) return
    dialog.setAttribute('data-answered', 'true')
    confirmLog.push(dialog.querySelector('p')?.textContent ?? '')
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('.dialog-actions button')
    const choice = declines > 0 ? buttons[0] : buttons[buttons.length - 1]
    if (declines > 0) declines--
    act(() => choice?.click())
  }).observe(document.body, { childList: true, subtree: true })
}
