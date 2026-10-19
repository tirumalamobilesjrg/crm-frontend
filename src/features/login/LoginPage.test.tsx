import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './LoginPage'
import { renderApp } from '../../test/utils'

describe('LoginPage', () => {
  it('shows a friendly message for wrong credentials and keeps the form usable', async () => {
    const signIn = vi.fn().mockRejectedValue({ error_code: 'invalid_credentials', message: 'Invalid login credentials' })
    renderApp(<LoginPage />, { state: { status: 'signedOut' }, signIn })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    expect(signIn).toHaveBeenCalledWith('a@b.co', 'wrong')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('leaves the login page when the account has no usable staff profile, so the reason can be shown', () => {
    renderApp(<LoginPage />, { state: { status: 'noAccess', reason: 'no_profile', message: 'Your login has no staff profile. Ask an Admin to add you.' } })
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('disables sign in until both fields are filled', async () => {
    renderApp(<LoginPage />, { state: { status: 'signedOut' } })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })
})

describe('LoginPage while signing in', () => {
  it('shows a spinner and locks the form from the click until the redirect, even after sign-in succeeded', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined) // the profile is still loading: the page stays until state turns ready
    renderApp(<LoginPage />, { state: { status: 'signedOut' }, signIn })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'right')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const busy = await screen.findByRole('button', { name: 'Signing in…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelector('.spinner')).not.toBeNull()
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
  })
})
