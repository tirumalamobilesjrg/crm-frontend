import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { Route, Routes } from 'react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Layout } from './Layout'
import { Dialog, EmptyState, Skeleton, ToastProvider, useToast } from './ui'
import { useFocusTrap } from './useFocusTrap'
import { applyTheme, isThemeChoice, nextTheme, readTheme } from '../lib/theme'
import { readyState, renderApp } from '../test/utils'

const show = (role: 'admin' | 'manager', route = '/') =>
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<h1>Home page</h1>} />
        <Route path="pos" element={<h1>Sale page</h1>} />
      </Route>
    </Routes>,
    { state: readyState(role), route },
  )

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('Layout navigation', () => {
  it('groups pages by what the person is doing, and shows a Manager only the pages they may use', () => {
    show('manager')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(within(nav).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Sell', 'Stock', 'Catalogue', 'Money'])
    expect(within(within(nav).getByRole('group', { name: 'Sell' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['New sale', 'Sales', 'Customers'])
    expect(within(within(nav).getByRole('group', { name: 'Stock' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['Inventory', 'Purchases', 'Suppliers'])
    for (const hidden of ['Discount approvals', 'Audit log', 'Settings']) expect(within(nav).queryByRole('link', { name: hidden })).not.toBeInTheDocument()
  })

  it('an Admin also gets the Admin group', () => {
    show('admin')
    const admin = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('group', { name: 'Admin' })
    expect(within(admin).getAllByRole('link').map((l) => l.textContent)).toEqual(['Discount approvals', 'Audit log', 'Settings'])
  })

  it('marks the current page', () => {
    show('manager', '/pos')
    expect(screen.getByRole('link', { name: 'New sale' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('shows who is signed in and signs out', async () => {
    show('manager')
    expect(screen.getByText('Mohan Manager')).toBeInTheDocument()
    expect(screen.getByText('Manager')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
  })
})

describe('phone drawer', () => {
  it('opens from the menu button, moves focus in, traps Tab, closes on Escape and returns focus', async () => {
    const user = userEvent.setup()
    show('manager')
    const rail = document.getElementById('main-nav')!
    const menu = screen.getByRole('button', { name: 'Open menu' })
    expect(rail).toHaveAttribute('data-open', 'false')
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await user.click(menu)
    expect(rail).toHaveAttribute('data-open', 'true')
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(rail.contains(document.activeElement)).toBe(true)
    for (let i = 0; i < 40; i++) await user.tab() // far more tabs than controls: focus must never leave the drawer
    expect(rail.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    expect(rail).toHaveAttribute('data-open', 'false')
    expect(menu).toHaveFocus()
  }, 20_000) // 40 simulated Tab presses are slow when the whole suite runs in parallel

  it('closes when a page is chosen', async () => {
    const user = userEvent.setup()
    show('manager')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('link', { name: 'New sale' }))
    expect(await screen.findByRole('heading', { name: 'Sale page' })).toBeInTheDocument()
    expect(document.getElementById('main-nav')).toHaveAttribute('data-open', 'false')
  })

  it('closes from the close button and from the backdrop', async () => {
    const user = userEvent.setup()
    const { container } = show('manager')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(document.getElementById('main-nav')).toHaveAttribute('data-open', 'false')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(container.querySelector('.scrim')!)
    expect(document.getElementById('main-nav')).toHaveAttribute('data-open', 'false')
  })
})

describe('colour theme', () => {
  it('cycles match-device, light, dark and remembers a forced choice', async () => {
    const user = userEvent.setup()
    show('manager')
    const toggle = () => screen.getByRole('button', { name: /^Colour theme:/ })
    expect(toggle()).toHaveAccessibleName('Colour theme: Match this device. Change')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    await user.click(toggle())
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    await user.click(toggle())
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem('crm-theme')).toBe('dark')
    await user.click(toggle())
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem('crm-theme')).toBeNull()
  })
  it('helpers validate and rotate', () => {
    expect(isThemeChoice('dark')).toBe(true)
    expect(isThemeChoice('sepia')).toBe(false)
    expect([nextTheme('system'), nextTheme('light'), nextTheme('dark')]).toEqual(['light', 'dark', 'system'])
  })
  it('reads a saved choice, ignores junk, and survives blocked storage', () => {
    localStorage.setItem('crm-theme', 'dark')
    expect(readTheme()).toBe('dark')
    localStorage.setItem('crm-theme', 'neon')
    expect(readTheme()).toBe('system')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readTheme()).toBe('system')
    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    vi.restoreAllMocks()
  })
})

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      {open && (
        <Dialog title="Edit thing" onClose={() => setOpen(false)}>
          <input aria-label="First" />
          <button>Middle</button>
          <input aria-label="Last" />
        </Dialog>
      )}
    </>
  )
}

describe('Dialog', () => {
  it('is named by its title, focuses the first field, keeps Tab inside, closes on Escape and restores focus', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    const opener = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Edit thing' })
    expect(screen.getByLabelText('First')).toHaveFocus()
    for (let i = 0; i < 12; i++) await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
  it('closes from the close button and from a click on the backdrop', async () => {
    const user = userEvent.setup()
    const { container } = render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    await user.click(container.ownerDocument.querySelector('.overlay')!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('useFocusTrap', () => {
  it('does nothing while inactive', async () => {
    function Probe({ active }: { active: boolean }) {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref, active)
      return <div ref={ref}><button>inside</button></div>
    }
    render(<><button>outside</button><Probe active={false} /></>)
    screen.getByRole('button', { name: 'outside' }).focus()
    await userEvent.setup().tab()
    expect(screen.getByRole('button', { name: 'inside' })).toHaveFocus()
  })
})

describe('Toasts', () => {
  function Notifier() {
    const { notify } = useToast()
    return (
      <>
        <button onClick={() => notify('Saved it')}>good</button>
        <button onClick={() => notify('That failed', 'bad')}>bad</button>
        <button onClick={() => { for (let i = 1; i <= 6; i++) notify(`Message ${i}`) }}>many</button>
      </>
    )
  }
  const setup = () => render(<ToastProvider><Notifier /></ToastProvider>)

  it('announces success politely and failure as an alert, each with a dismiss button', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'good' }))
    await user.click(screen.getByRole('button', { name: 'bad' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved it')
    expect(screen.getByRole('alert')).toHaveTextContent('That failed')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss message' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('keeps at most four on screen, newest last', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'many' }))
    const shown = screen.getAllByRole('status').map((t) => t.textContent)
    expect(shown).toEqual(['Message 3', 'Message 4', 'Message 5', 'Message 6'])
  })
  it('success messages leave by themselves; failures stay longer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    await user.click(screen.getByRole('button', { name: 'good' }))
    await user.click(screen.getByRole('button', { name: 'bad' }))
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('Saved it')).not.toBeInTheDocument()
    expect(screen.getByText('That failed')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.queryByText('That failed')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('EmptyState and Skeleton', () => {
  it('an empty state says what this is and offers the next step', () => {
    render(<EmptyState title="No customers yet" action={<button>Add the first customer</button>}>Customers appear here once they buy something.</EmptyState>)
    expect(screen.getByRole('heading', { name: 'No customers yet' })).toBeInTheDocument()
    expect(screen.getByText(/appear here once they buy/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add the first customer' })).toBeInTheDocument()
  })
  it('a skeleton is decorative', () => {
    const { container } = render(<Skeleton lines={4} />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('span')).toHaveLength(4)
  })
})
