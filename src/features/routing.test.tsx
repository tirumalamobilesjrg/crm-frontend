import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { AppRoutes } from '../App'
import { readyState, renderApp } from '../test/utils'

vi.mock('../api/dashboard', () => ({
  loadDashboardCounts: vi.fn().mockResolvedValue({ products: 3, published: 2, devicesInStock: 5, accessorySkus: 1 }),
}))
vi.mock('../api/settings', () => ({
  listPolicies: vi.fn().mockResolvedValue([]),
  listStaff: vi.fn().mockResolvedValue([]),
  savePolicy: vi.fn(),
  addStaff: vi.fn(),
  updateStaff: vi.fn(),
}))

describe('routing and role-aware navigation', () => {
  it('sends a signed-out visitor to the login page', async () => {
    renderApp(<AppRoutes />, { state: { status: 'signedOut' }, route: '/catalogue/products' })
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('explains why an account without a profile cannot use the CRM', async () => {
    renderApp(<AppRoutes />, { state: { status: 'noAccess', reason: 'no_profile', message: 'Your login has no staff profile. Ask an Admin to add you.' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/no staff profile/i)
  })

  it('shows an Admin the Settings link and page', async () => {
    renderApp(<AppRoutes />, { state: readyState('admin'), route: '/settings' })
    expect(await screen.findByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'Discount policy' })).toBeInTheDocument()
  })

  it('hides Settings from a Manager and blocks the URL', async () => {
    renderApp(<AppRoutes />, { state: readyState('manager'), route: '/settings' })
    expect(await screen.findByText('Not allowed')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Products' })).toBeInTheDocument()
  })

  it('shows the dashboard counts', async () => {
    renderApp(<AppRoutes />, { state: readyState('manager') })
    expect(await screen.findByText('Welcome, Mohan Manager')).toBeInTheDocument()
    expect(await screen.findByText('Phones in stock')).toBeInTheDocument()
  })
})
