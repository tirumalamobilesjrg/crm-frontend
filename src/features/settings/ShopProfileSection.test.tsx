import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShopProfileSection } from './ShopProfileSection'
import { toForm, validateShopProfile } from './shopProfileValidation'
import { readyState, renderApp } from '../../test/utils'
import * as api from '../../api/settings'
import { AppError } from '../../lib/errors'

vi.mock('../../api/settings')

const empty = { shop_name: 'Tirumala Mobiles', address: null, phone: null, whatsapp: null, email: null, opening_hours: null, map_url: null, about: null }

describe('validateShopProfile', () => {
  const form = (patch: Record<string, string> = {}) => ({ ...toForm(empty), ...patch })
  it('turns blank optional fields into null and trims text', () => {
    const r = validateShopProfile(form({ phone: ' 98765 43210 ', about: '  Hi  ' }))
    expect(r.error).toBeNull()
    expect(r.value).toEqual({ ...empty, phone: '98765 43210', about: 'Hi' })
  })
  it('requires a shop name', () => expect(validateShopProfile(form({ shop_name: '  ' })).error).toMatch(/shop name/))
  it('checks phone, email and map link', () => {
    expect(validateShopProfile(form({ phone: '123' })).error).toMatch(/10 to 15 digits/)
    expect(validateShopProfile(form({ whatsapp: 'abc' })).error).toMatch(/WhatsApp/)
    expect(validateShopProfile(form({ email: 'nope' })).error).toMatch(/email/)
    expect(validateShopProfile(form({ map_url: 'http://maps.example.com' })).error).toMatch(/https/)
    expect(validateShopProfile(form({ map_url: 'javascript:alert(1)' })).error).toMatch(/https/)
    expect(validateShopProfile(form({ map_url: 'https://maps.app.goo.gl/abc', phone: '+91 98765 43210' })).error).toBeNull()
  })
  it('limits length', () => expect(validateShopProfile(form({ about: 'x'.repeat(2001) })).error).toMatch(/too long/))
})

describe('ShopProfileSection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.loadShopProfile).mockResolvedValue(empty)
    vi.mocked(api.saveShopProfile).mockResolvedValue(undefined as never)
  })

  it('loads the current details and saves edits', async () => {
    renderApp(<ShopProfileSection />, { state: readyState('admin') })
    const user = userEvent.setup()
    expect(await screen.findByLabelText('Shop name')).toHaveValue('Tirumala Mobiles')
    await user.type(screen.getByLabelText(/^Phone/), '98765 43210')
    await user.type(screen.getByLabelText('Address'), '1 Main Road')
    await user.click(screen.getByRole('button', { name: 'Save shop details' }))
    expect(api.saveShopProfile).toHaveBeenCalledWith({ ...empty, phone: '98765 43210', address: '1 Main Road' })
  })

  it('does not call the API for an invalid value and says why', async () => {
    renderApp(<ShopProfileSection />, { state: readyState('admin') })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/Map link/), 'http://insecure.example.com')
    await user.click(screen.getByRole('button', { name: 'Save shop details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/https/)
    expect(api.saveShopProfile).not.toHaveBeenCalled()
  })

  it('shows a friendly message when saving fails', async () => {
    vi.mocked(api.saveShopProfile).mockRejectedValue(new AppError('You do not have permission to do that.', 'permission'))
    renderApp(<ShopProfileSection />, { state: readyState('admin') })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Save shop details' }))
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument()
  })

  it('offers a retry when the details cannot be loaded', async () => {
    vi.mocked(api.loadShopProfile).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockResolvedValue(empty)
    renderApp(<ShopProfileSection />, { state: readyState('admin') })
    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Shop name')).toBeInTheDocument()
  })
})
