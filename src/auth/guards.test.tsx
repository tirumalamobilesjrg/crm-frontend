import { describe, expect, it } from 'vitest'
import { Route, Routes } from 'react-router'
import { render, screen } from '@testing-library/react'
import { RequireAuth } from './guards'
import type { AuthState } from './AuthProvider'
import { PageLoader } from '../components/ui'
import { readyState, renderApp } from '../test/utils'

const show = (state: AuthState) =>
  renderApp(
    <Routes>
      <Route element={<RequireAuth />}>
        <Route index element={<h1>Secret page</h1>} />
      </Route>
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>,
    { state },
  )

describe('RequireAuth', () => {
  it('shows the branded loader while the session is checked, not a blank page or a not-found page', () => {
    show({ status: 'loading' })
    const loader = screen.getByRole('status')
    expect(loader).toHaveTextContent('Checking your session…')
    expect(loader.querySelector('.loader-mark img')).not.toBeNull()
    expect(screen.queryByText('Secret page')).not.toBeInTheDocument()
  })
  it('sends a signed-out visitor to the login page', () => {
    show({ status: 'signedOut' })
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument()
  })
  it('lets a signed-in person through', () => {
    show(readyState('manager'))
    expect(screen.getByRole('heading', { name: 'Secret page' })).toBeInTheDocument()
  })
})

describe('PageLoader', () => {
  it('announces its label as a status and keeps the emblem decorative', () => {
    render(<PageLoader label="Signing you in…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in…')
    expect(screen.getByRole('status').querySelector('.loader-mark')).toHaveAttribute('aria-hidden', 'true')
  })
})
