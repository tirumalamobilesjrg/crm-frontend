import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PurchaseDetailPage } from './PurchaseDetailPage'
import { readyState, renderApp } from '../../test/utils'
import * as api from '../../api/purchasing'
import type { PurchaseLine, PurchaseRow } from '../../lib/types'

vi.mock('../../api/purchasing')

const A = '490154203237518'
const B = '356938035643809'

const purchase = (over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  id: 'p1', supplier_id: 's1', supplier_invoice_no: 'INV-77', invoice_date: '2026-10-18', status: 'draft', total: 0,
  notes: null, received_at: null, created_at: '2026-10-18T00:00:00Z', supplier: { name: 'Metro Traders' }, ...over,
})
const line = (id: string, sku: string, quantity: number, mode: 'serialized' | 'quantity'): PurchaseLine => ({
  id, purchase_id: 'p1', variant_id: `v-${id}`, quantity, unit_cost: 500, line_total: quantity * 500,
  variant: { sku, color: null, ram_gb: null, storage_gb: null, tracking_mode: mode, product: { name: 'Item' } },
})

function show() {
  return renderApp(
    <Routes>
      <Route path="/purchasing/purchases/:id" element={<PurchaseDetailPage />} />
    </Routes>,
    { state: readyState('manager'), route: '/purchasing/purchases/p1' },
  )
}

const received = { purchase_id: 'p1', units_received: 2, quantity_lines_received: 0, quantity_units_received: 0, replayed: false }

describe('PurchaseDetailPage receiving', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.getPurchase).mockResolvedValue(purchase())
    vi.mocked(api.listVariantOptions).mockResolvedValue([])
    vi.mocked(api.listPurchaseLines).mockResolvedValue([line('l1', 'NX1', 2, 'serialized'), line('l2', 'CASE', 10, 'quantity')])
    vi.mocked(api.receivePurchase).mockResolvedValue(received)
  })

  it('shows one box per phone (none for accessories) and moves to the next box on Enter', async () => {
    show()
    const first = await screen.findByLabelText(/phone 1 of 2/)
    const second = screen.getByLabelText(/phone 2 of 2/)
    expect(screen.getAllByPlaceholderText(/Scan or type/)).toHaveLength(2)
    expect(screen.getByText(/10 × CASE/)).toBeInTheDocument()
    await userEvent.setup().type(first, `${A}{Enter}`)
    expect(second).toHaveFocus()
  })

  it('flags a bad IMEI and a duplicate, and does not call the API', async () => {
    show()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/phone 1 of 2/), '490154203237519')
    expect(await screen.findByText(/check digit/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/phone 1 of 2/))
    await user.type(screen.getByLabelText(/phone 1 of 2/), A)
    await user.type(screen.getByLabelText(/phone 2 of 2/), A)
    expect(await screen.findAllByText(/Duplicate/)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Receive stock' }))
    expect(api.receivePurchase).not.toHaveBeenCalled()
  })

  it('submits the units with an idempotency key, and Enter in the last box submits', async () => {
    show()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/phone 1 of 2/), `${A}{Enter}`)
    await user.type(screen.getByLabelText(/phone 2 of 2/), `${B}{Enter}`)
    await waitFor(() => expect(api.receivePurchase).toHaveBeenCalledTimes(1))
    const [id, units, key] = vi.mocked(api.receivePurchase).mock.calls[0]!
    expect(id).toBe('p1')
    expect(units).toEqual([
      { purchase_item_id: 'l1', imei1: A },
      { purchase_item_id: 'l1', imei1: B },
    ])
    expect(key.length).toBeGreaterThanOrEqual(8)
  })

  it('reuses the key when the same units are retried after a failure', async () => {
    vi.mocked(api.receivePurchase).mockRejectedValueOnce(new Error('Cannot reach the server.')).mockResolvedValue(received)
    show()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/phone 1 of 2/), A)
    await user.type(screen.getByLabelText(/phone 2 of 2/), B)
    await user.click(screen.getByRole('button', { name: 'Receive stock' }))
    await screen.findByText('Cannot reach the server.')
    await user.click(screen.getByRole('button', { name: 'Receive stock' }))
    await waitFor(() => expect(api.receivePurchase).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(api.receivePurchase).mock.calls
    expect(calls[1]![2]).toBe(calls[0]![2])
  })

  it('uses a new key when the units were changed between attempts', async () => {
    vi.mocked(api.receivePurchase).mockRejectedValueOnce(new Error('Cannot reach the server.')).mockResolvedValue(received)
    show()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/phone 1 of 2/), A)
    await user.type(screen.getByLabelText(/phone 2 of 2/), B)
    await user.click(screen.getByRole('button', { name: 'Receive stock' }))
    await screen.findByText('Cannot reach the server.')
    await user.clear(screen.getByLabelText(/phone 2 of 2/))
    await user.type(screen.getByLabelText(/phone 2 of 2/), 'SN-5555')
    await user.click(screen.getByRole('button', { name: 'Receive stock' }))
    await waitFor(() => expect(api.receivePurchase).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(api.receivePurchase).mock.calls
    expect(calls[1]![2]).not.toBe(calls[0]![2])
  })

  it('receives an accessory-only purchase with an empty unit list', async () => {
    vi.mocked(api.listPurchaseLines).mockResolvedValue([line('l2', 'CASE', 10, 'quantity')])
    show()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Receive stock' }))
    await waitFor(() => expect(api.receivePurchase).toHaveBeenCalledWith('p1', [], expect.any(String)))
    expect(screen.queryByPlaceholderText(/Scan or type/)).not.toBeInTheDocument()
  })

  it('shows the database error, for example a duplicate IMEI already in stock', async () => {
    vi.mocked(api.receivePurchase).mockRejectedValue(new Error('A record with this imei1 ("490154203237518") already exists.'))
    show()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/phone 1 of 2/), A)
    await user.type(screen.getByLabelText(/phone 2 of 2/), B)
    await user.click(screen.getByRole('button', { name: 'Receive stock' }))
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
  })

  it('does not offer receiving once a purchase is received', async () => {
    vi.mocked(api.getPurchase).mockResolvedValue(purchase({ status: 'received', received_at: '2026-10-18T10:00:00Z' }))
    show()
    expect(await screen.findByText('Received', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Receive stock' })).not.toBeInTheDocument()
  })
})
