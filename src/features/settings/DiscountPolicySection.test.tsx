import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscountPolicySection } from './DiscountPolicySection'
import { readyState, renderApp } from '../../test/utils'
import * as api from '../../api/settings'

vi.mock('../../api/settings')

describe('DiscountPolicySection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.listPolicies).mockResolvedValue([
      { role: 'admin', can_discount: true, max_percent: 100, max_amount: null, can_approve: true, configured_at: null },
      { role: 'manager', can_discount: false, max_percent: 0, max_amount: null, can_approve: false, configured_at: null },
    ])
    vi.mocked(api.savePolicy).mockResolvedValue(null as never)
  })

  it('flags a Manager policy that nobody has reviewed and never offers approval rights to Managers', async () => {
    renderApp(<DiscountPolicySection />, { state: readyState('admin') })
    const mgr = await screen.findByRole('region', { name: 'Manager discount policy' })
    expect(within(mgr).getByText(/Never reviewed/)).toBeInTheDocument()
    expect(within(mgr).queryByLabelText(/approve discounts for others/)).not.toBeInTheDocument()
    expect(within(mgr).getByText(/Managers can never approve/)).toBeInTheDocument()
  })

  it('saves a valid Manager limit', async () => {
    renderApp(<DiscountPolicySection />, { state: readyState('admin') })
    const mgr = await screen.findByRole('region', { name: 'Manager discount policy' })
    const user = userEvent.setup()
    await user.click(within(mgr).getByLabelText(/May give discounts/))
    await user.clear(within(mgr).getByLabelText(/Largest discount per item/))
    await user.type(within(mgr).getByLabelText(/Largest discount per item/), '7.5')
    await user.type(within(mgr).getByLabelText(/Largest total discount per sale/), '2000')
    await user.click(within(mgr).getByRole('button', { name: 'Save Manager policy' }))
    expect(api.savePolicy).toHaveBeenCalledWith({ role: 'manager', can_discount: true, max_percent: 7.5, max_amount: 2000, can_approve: false })
  })

  it('does not call the API for an invalid value and explains why', async () => {
    renderApp(<DiscountPolicySection />, { state: readyState('admin') })
    const mgr = await screen.findByRole('region', { name: 'Manager discount policy' })
    const user = userEvent.setup()
    await user.click(within(mgr).getByLabelText(/May give discounts/))
    await user.clear(within(mgr).getByLabelText(/Largest discount per item/))
    await user.type(within(mgr).getByLabelText(/Largest discount per item/), '150')
    await user.click(within(mgr).getByRole('button', { name: 'Save Manager policy' }))
    expect(await within(mgr).findByRole('alert')).toHaveTextContent(/between 0 and 100/)
    expect(api.savePolicy).not.toHaveBeenCalled()
  })
})
