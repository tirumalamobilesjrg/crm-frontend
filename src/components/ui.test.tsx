import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider, Tabs, useConfirm } from './ui'
import { labelTables } from './tableCards'

function Asker({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
  const confirm = useConfirm()
  return <button onClick={() => void confirm({ title: 'Delete thing', message: 'Delete the thing?', confirmLabel: 'Delete', danger: true }).then(onAnswer)}>Ask</button>
}

describe('confirmation dialog', () => {
  const setup = () => {
    const onAnswer = vi.fn()
    render(<ToastProvider><Asker onAnswer={onAnswer} /></ToastProvider>)
    return { onAnswer, user: userEvent.setup() }
  }

  it('resolves true on the confirm button and shows the message', async () => {
    const { onAnswer, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(screen.getByRole('dialog', { name: 'Delete thing' })).toHaveTextContent('Delete the thing?')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onAnswer).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves false on Cancel and on Escape', async () => {
    const { onAnswer, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onAnswer).toHaveBeenLastCalledWith(false)
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.keyboard('{Escape}')
    expect(onAnswer).toHaveBeenCalledTimes(2)
    expect(onAnswer).toHaveBeenLastCalledWith(false)
  })
})

describe('Tabs', () => {
  const TABS = [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }, { id: 'c', label: 'Third' }] as const
  function Demo() {
    const [v, setV] = useState<'a' | 'b' | 'c'>('a')
    return <Tabs tabs={TABS} value={v} onChange={setV} label="Demo">content {v}</Tabs>
  }

  it('links tabs to a labelled panel and keeps only the selected tab in the Tab order', () => {
    render(<Demo />)
    const first = screen.getByRole('tab', { name: 'First' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tabpanel', { name: 'First' })).toHaveTextContent('content a')
  })

  it('moves and selects with the arrow keys, wrapping, and with Home and End', async () => {
    render(<Demo />)
    const user = userEvent.setup()
    screen.getByRole('tab', { name: 'First' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('content b')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus()
  })
})

describe('labelTables', () => {
  it('copies header text onto cells, skips spanning rows and invoice lines', () => {
    document.body.innerHTML = `
      <table class="table"><thead><tr><th>Name</th><th>Price</th></tr></thead>
        <tbody><tr><td>Case</td><td>₹10</td></tr><tr><td colspan="2" class="muted">None</td></tr></tbody></table>
      <table class="table invoice-lines"><thead><tr><th>Item</th></tr></thead><tbody><tr><td>X</td></tr></tbody></table>
      <table class="table"><tbody><tr><th scope="row">Key</th><td>Value</td></tr></tbody></table>`
    labelTables(document.body)
    const [t1, inv, kv] = Array.from(document.querySelectorAll('table'))
    expect(t1!.classList.contains('row-cards')).toBe(true)
    expect(Array.from(t1!.querySelectorAll('td')).map((c) => c.getAttribute('data-label'))).toEqual(['Name', 'Price', null])
    expect(inv!.classList.contains('row-cards')).toBe(false)
    expect(kv!.classList.contains('row-cards')).toBe(false)
  })
})
