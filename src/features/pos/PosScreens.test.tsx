import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PosPage } from './PosPage'
import { InvoicePage } from './InvoicePage'
import { SalesPage } from './SalesPage'
import { ApprovalsPage } from './ApprovalsPage'
import { AppRoutes } from '../../App'
import { autoConfirm, confirmLog, declineNextConfirm, readyState, renderApp } from '../../test/utils'
import * as sales from '../../api/sales'
import * as settings from '../../api/settings'
import { AppError } from '../../lib/errors'
import type { DiscountApproval, DiscountPolicy, Invoice, SellableAccessory, SellableDevice } from '../../lib/types'

vi.mock('../../api/sales')
vi.mock('../../api/settings', () => ({ listPolicies: vi.fn(), listStaff: vi.fn(), savePolicy: vi.fn(), addStaff: vi.fn(), updateStaff: vi.fn() }))
vi.mock('../../api/dashboard', () => ({ loadDashboardCounts: vi.fn().mockResolvedValue({ products: 0, published: 0, devicesInStock: 0, accessorySkus: 0 }) }))

const IMEI = '490154203237518'
const variant = { id: 'v1', sku: 'NOVA-X1', color: 'Black', ram_gb: 8, storage_gb: 128, mrp: 20000, selling_price: 19000, is_active: true, product: { name: 'X1', brand: { name: 'Nova' } } }
const device = (over: Partial<SellableDevice> = {}): SellableDevice => ({ id: 'd1', variant_id: 'v1', imei1: IMEI, imei2: null, serial_number: null, status: 'in_stock', variant, ...over })
const acc: SellableAccessory = { id: 'a1', sku: 'CASE', color: 'Black', mrp: 500, selling_price: 400, is_active: true, product: { name: 'Case', brand: { name: 'Nova' } }, on_hand: 20 }
const policy = (role: 'admin' | 'manager', over: Partial<DiscountPolicy> = {}): DiscountPolicy => ({ role, can_discount: role === 'admin', max_percent: role === 'admin' ? 100 : 0, max_amount: null, can_approve: role === 'admin', configured_at: null, ...over })
const approval: DiscountApproval = { id: 'ap1', requested_for: '11111111-1111-1111-1111-111111111111', approved_by: 'admin-id', max_amount: 1500, reason: 'Festival offer', expires_at: new Date(Date.now() + 600_000).toISOString(), used_at: null, used_in_sale_id: null, created_at: '', inventory_item_id: 'd1', variant_id: null }
const invoice: Invoice = {
  id: 'i1', sale_id: 's1', invoice_number: 'TM/26-27/000001', issued_at: '2026-10-18T10:00:00Z', shop_name: 'Tirumala Mobiles', shop_address: 'Main Road', customer_name: 'Ravi Kumar', customer_phone: '9876543210', customer_address: null,
  subtotal: 19800, discount_total: 0, grand_total: 19800,
  items: [
    { id: 'l1', line_no: 1, description: 'Nova X1 Black 128GB', sku: 'NOVA-X1', imei1: IMEI, imei2: null, serial_number: null, quantity: 1, unit_price: 19000, discount_amount: 0, line_total: 19000 },
    { id: 'l2', line_no: 2, description: 'Nova Case Black', sku: 'CASE', imei1: null, imei2: null, serial_number: null, quantity: 2, unit_price: 400, discount_amount: 0, line_total: 800 },
  ],
  payments: [{ method: 'cash', amount: 19800, reference: 'till 1', received_at: '2026-10-18T10:00:00Z' }],
  sale: { sold_by: '11111111-1111-1111-1111-111111111111', sold_at: '2026-10-18T10:00:00Z', discount_reason: null, discount_basis: 'none', discount_authorized_by: null, notes: null },
}
const sold = { sale_id: 's1', invoice_id: 'i1', invoice_number: 'TM/26-27/000001', total: 19000, discount_total: 0, replayed: false }

function showPos(role: 'admin' | 'manager' = 'manager') {
  return renderApp(
    <Routes>
      <Route path="/pos" element={<PosPage />} />
      <Route path="/sales/:id" element={<InvoicePage />} />
    </Routes>,
    { state: readyState(role), route: '/pos' },
  )
}
const scan = async (user: ReturnType<typeof userEvent.setup>, value = IMEI) => {
  await user.type(await screen.findByLabelText('Scan IMEI or serial number'), `${value}{Enter}`)
}
const pay = async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(await screen.findByLabelText('Paid by'), 'cash')

beforeEach(() => {
  vi.resetAllMocks()
  autoConfirm()
  vi.mocked(settings.listPolicies).mockResolvedValue([policy('admin'), policy('manager')])
  vi.mocked(settings.listStaff).mockResolvedValue([
    { user_id: '11111111-1111-1111-1111-111111111111', full_name: 'Mohan Manager', role: 'manager', phone: null, is_active: true, created_at: '' },
    { user_id: 'admin-id', full_name: 'Asha Admin', role: 'admin', phone: null, is_active: true, created_at: '' },
  ])
  vi.mocked(sales.listSellableAccessories).mockResolvedValue([acc])
  vi.mocked(sales.listUsableApprovals).mockResolvedValue([])
  vi.mocked(sales.findDeviceByIdentifier).mockResolvedValue([device()])
  vi.mocked(sales.searchCustomers).mockResolvedValue([])
  vi.mocked(sales.getInvoiceBySale).mockResolvedValue(invoice)
})

describe('POS: adding items', () => {
  it('scanning an IMEI (scanner sends Enter) adds the phone at its selling price and shows the totals', async () => {
    const user = userEvent.setup()
    showPos()
    await scan(user)
    const cart = await screen.findByRole('table', { name: 'Sale lines' })
    expect(within(cart).getByText('Nova X1 Black 8GB RAM 128GB')).toBeInTheDocument()
    expect(within(cart).getByText(IMEI)).toBeInTheDocument()
    expect(within(cart).getByText('MRP ₹20,000.00')).toBeInTheDocument()
    expect(sales.findDeviceByIdentifier).toHaveBeenCalledWith(IMEI)
    expect(screen.getByLabelText('Totals and discount')).toHaveTextContent('₹19,000.00')
    expect(screen.getByLabelText('Scan IMEI or serial number')).toHaveValue('') // ready for the next scan
  })

  it.each([
    [[], /No device with IMEI or serial number/],
    [[{ status: 'sold' }], /already sold/],
    [[{ status: 'damaged' }], /marked damaged/],
  ] as const)('refuses a device that cannot be sold with a clear reason (%j)', async (found, text) => {
    vi.mocked(sales.findDeviceByIdentifier).mockResolvedValue(found.map((f) => device(f as Partial<SellableDevice>)))
    const user = userEvent.setup()
    showPos()
    await scan(user)
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Sale lines' })).not.toBeInTheDocument()
  })

  it('refuses the same device twice and a too-short scan', async () => {
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await screen.findByRole('table', { name: 'Sale lines' })
    await scan(user)
    expect(await screen.findByText(/already in this sale/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Scan IMEI or serial number')) // a failed scan keeps the text so it can be corrected
    await user.type(screen.getByLabelText('Scan IMEI or serial number'), '12{Enter}')
    expect(await screen.findByText(/Scan or type the full IMEI/)).toBeInTheDocument()
  })

  it('adds an accessory with an editable quantity and enforces stock and MRP per unit', async () => {
    const user = userEvent.setup()
    showPos()
    await user.selectOptions(await screen.findByLabelText('Accessory'), 'a1')
    await user.click(screen.getByRole('button', { name: 'Add accessory' }))
    const qty = await screen.findByLabelText('Quantity for CASE')
    await user.clear(qty)
    await user.type(qty, '21')
    expect(await screen.findByText('Only 20 in stock.')).toBeInTheDocument()
    await user.clear(qty)
    await user.type(qty, '3')
    expect(screen.getByLabelText('Totals and discount')).toHaveTextContent('₹1,200.00')
    const price = screen.getByLabelText('Unit price for CASE')
    await user.clear(price)
    await user.type(price, '500.01')
    expect(await screen.findByText(/Above the MRP of ₹500/)).toBeInTheDocument()
  })

  it('shows an error if the lookup itself fails', async () => {
    vi.mocked(sales.findDeviceByIdentifier).mockRejectedValue(new AppError('Cannot reach the server.', 'network'))
    const user = userEvent.setup()
    showPos()
    await scan(user)
    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument()
  })
})

describe('POS: discounts', () => {
  it('a manager with no allowance needs an approval; the sale is blocked until one is chosen', async () => {
    vi.mocked(sales.listUsableApprovals).mockResolvedValue([approval])
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await user.type(await screen.findByLabelText('Discount for NOVA-X1'), '1000')
    expect(await screen.findByText('Needs an Admin approval')).toBeInTheDocument()
    await pay(user)
    await user.type(screen.getByLabelText('Reason for the discount'), 'Festival offer')
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(await screen.findByText(/Ask an Admin for a discount approval/)).toBeInTheDocument()
    expect(sales.finalizeSale).not.toHaveBeenCalled()
  })

  it('choosing an approval that covers the discount lets the sale go, sending the approval id and the reason', async () => {
    vi.mocked(sales.listUsableApprovals).mockResolvedValue([approval])
    vi.mocked(sales.finalizeSale).mockResolvedValue({ ...sold, total: 18000, discount_total: 1000 })
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await user.type(await screen.findByLabelText('Discount for NOVA-X1'), '1000')
    await user.selectOptions(await screen.findByLabelText('Discount approval'), 'ap1')
    await user.type(screen.getByLabelText('Reason for the discount'), 'Festival offer')
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await waitFor(() => expect(sales.finalizeSale).toHaveBeenCalledTimes(1))
    const [input] = vi.mocked(sales.finalizeSale).mock.calls[0]!
    expect(input).toMatchObject({ approvalId: 'ap1', discountReason: 'Festival offer', items: [{ inventory_item_id: 'd1', unit_price: 19000, discount_amount: 1000 }], payment: { method: 'cash', amount: 18000 } })
  })

  it("a discount inside the seller's configured limit needs only a reason", async () => {
    vi.mocked(settings.listPolicies).mockResolvedValue([policy('admin'), policy('manager', { can_discount: true, max_percent: 5 })])
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await user.type(await screen.findByLabelText('Discount for NOVA-X1'), '950')
    expect(await screen.findByText('Within your discount limit')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Discount for NOVA-X1'), '.01')
    expect(await screen.findByText('Needs an Admin approval')).toBeInTheDocument()
  })

  it('a discount without a reason is refused', async () => {
    vi.mocked(settings.listPolicies).mockResolvedValue([policy('admin'), policy('manager', { can_discount: true, max_percent: 10 })])
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await user.type(await screen.findByLabelText('Discount for NOVA-X1'), '500')
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(await screen.findByText(/needs a reason/)).toBeInTheDocument()
    expect(sales.finalizeSale).not.toHaveBeenCalled()
  })
})

describe('POS: payment and completing the sale', () => {
  it('requires a payment method and an amount equal to the total', async () => {
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await user.click(await screen.findByRole('button', { name: 'Complete sale' }))
    expect(await screen.findByText('Choose how the customer paid.')).toBeInTheDocument()
    await pay(user)
    const amount = screen.getByLabelText('Amount received (₹)')
    expect(amount).toHaveValue('19000.00') // defaults to the total
    await user.clear(amount)
    await user.type(amount, '18999')
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(await screen.findByText(/must equal the total \(₹19000.00\)/)).toBeInTheDocument()
    expect(sales.finalizeSale).not.toHaveBeenCalled()
  })

  it('asks for confirmation, and cancelling sends nothing', async () => {
    declineNextConfirm()
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(confirmLog).toContainEqual(expect.stringContaining('₹19,000.00 paid by Cash'))
    expect(sales.finalizeSale).not.toHaveBeenCalled()
  })

  it('completes the sale, sends the exact payload with an idempotency key, and opens the invoice the server issued', async () => {
    vi.mocked(sales.finalizeSale).mockResolvedValue(sold)
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await user.selectOptions(await screen.findByLabelText('Accessory'), 'a1')
    await user.click(screen.getByRole('button', { name: 'Add accessory' }))
    await pay(user)
    await user.type(screen.getByLabelText('Reference (optional)'), 'till 1')
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await waitFor(() => expect(sales.finalizeSale).toHaveBeenCalledTimes(1))
    const [input, key] = vi.mocked(sales.finalizeSale).mock.calls[0]!
    expect(input).toEqual({
      customerId: null,
      items: [{ inventory_item_id: 'd1', unit_price: 19000, discount_amount: 0 }, { variant_id: 'a1', quantity: 1, unit_price: 400, discount_amount: 0 }],
      payment: { method: 'cash', amount: 19400, reference: 'till 1' },
      notes: null, discountReason: null, approvalId: null,
    })
    expect(key.length).toBeGreaterThanOrEqual(8)
    // the toast and the banner on the invoice page both announce it
    const announcements = await screen.findAllByText(/Sale completed\. Invoice/)
    expect(announcements[0]).toHaveTextContent('TM/26-27/000001')
    // the toast appears before the invoice page has finished loading its data, so wait for the heading
    expect(await screen.findByRole('heading', { name: 'Invoice TM/26-27/000001' }, { timeout: 5000 })).toBeInTheDocument()
  }, 15_000)

  it('a rejected sale shows the server reason, claims nothing, and keeps the cart', async () => {
    vi.mocked(sales.finalizeSale).mockRejectedValue(new AppError('That item is not available (already sold, or not enough stock).', 'TM004'))
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(await screen.findByText(/not available/)).toBeInTheDocument()
    expect(screen.queryByText(/Sale completed/)).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Sale lines' })).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(sales.listSellableAccessories).mock.calls.length).toBeGreaterThan(1)) // stock re-read
  })

  it('retrying the identical sale after a failure reuses the idempotency key; a changed sale gets a new one', async () => {
    vi.mocked(sales.finalizeSale).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockResolvedValue(sold)
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await screen.findByText('Cannot reach the server.')
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await waitFor(() => expect(sales.finalizeSale).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(sales.finalizeSale).mock.calls
    expect(calls[1]![1]).toBe(calls[0]![1])
    await user.type(screen.getByLabelText('Reference (optional)'), 'changed')
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await waitFor(() => expect(sales.finalizeSale).toHaveBeenCalledTimes(3))
    expect(calls[2]![1]).not.toBe(calls[0]![1])
    expect(confirmLog).toContainEqual(expect.stringContaining('could not confirm whether the previous sale was saved'))
  })

  it('after an unconfirmed attempt, changing the sale asks first and declining sends nothing; after a clear rejection it does not ask', async () => {
    vi.mocked(sales.finalizeSale).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockRejectedValueOnce(new AppError('That stock is gone.', 'TM004')).mockResolvedValue(sold)
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await screen.findByText('Cannot reach the server.')
    await user.type(screen.getByLabelText('Reference (optional)'), 'changed')
    declineNextConfirm() // the first dialog is the "check Sales first" one
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(confirmLog).toContainEqual(expect.stringContaining('Open Sales and look for it'))
    expect(sales.finalizeSale).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Complete sale' })) // asks again; confirmed this time, then the sale confirmation
    await screen.findByText('That stock is gone.')
    confirmLog.length = 0
    await user.type(screen.getByLabelText('Reference (optional)'), '2')
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await waitFor(() => expect(sales.finalizeSale).toHaveBeenCalledTimes(3))
    expect(confirmLog.some((m) => m.includes('Open Sales and look for it'))).toBe(false)
  })

  it('does not submit twice while the first request is in flight', async () => {
    let resolve!: (v: typeof sold) => void
    vi.mocked(sales.finalizeSale).mockReturnValue(new Promise((r) => (resolve = r)))
    const user = userEvent.setup()
    showPos()
    await scan(user)
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    expect(await screen.findByRole('button', { name: 'Completing…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Completing…' }))
    expect(sales.finalizeSale).toHaveBeenCalledTimes(1)
    resolve(sold)
    expect(await screen.findByText(/Sale completed/)).toBeInTheDocument()
  })

  it('never implies the payment was verified', async () => {
    showPos()
    expect(await screen.findByText(/Recorded manually\. One payment per sale/)).toBeInTheDocument()
    expect(screen.queryByText(/verified|gateway|checkout/i)).not.toBeInTheDocument()
  })
})

describe('POS: customer', () => {
  it('finds a customer by name or phone and sends their id; the default is a walk-in sale', async () => {
    vi.mocked(sales.searchCustomers).mockResolvedValue([{ id: 'c1', name: 'Ravi Kumar', phone: '9876543210', email: null, address: null, notes: null }])
    vi.mocked(sales.finalizeSale).mockResolvedValue(sold)
    const user = userEvent.setup()
    showPos()
    expect(await screen.findByText(/Walk-in customer unless you pick one/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search customers'), 'rav')
    await user.click(await screen.findByRole('button', { name: /Ravi Kumar/ }))
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument()
    await scan(user)
    await pay(user)
    await user.click(screen.getByRole('button', { name: 'Complete sale' }))
    await waitFor(() => expect(sales.finalizeSale).toHaveBeenCalled())
    expect(vi.mocked(sales.finalizeSale).mock.calls[0]![0].customerId).toBe('c1')
  })

  it('creates a customer from the sale screen, validating first and translating a duplicate phone', async () => {
    vi.mocked(sales.createCustomer).mockRejectedValueOnce(new AppError('A customer with this phone number already exists. Search for them instead.', '23505')).mockResolvedValue({ id: 'c2', name: 'Sita', phone: '9000000001', email: null, address: null, notes: null })
    const user = userEvent.setup()
    showPos()
    await user.click(await screen.findByRole('button', { name: 'New customer' }))
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(await screen.findByText(/Enter the customer name/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Sita')
    await user.type(screen.getByLabelText('Phone'), '90000 00001')
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(await screen.findByText('Sita')).toBeInTheDocument()
    expect(sales.createCustomer).toHaveBeenLastCalledWith({ name: 'Sita', phone: '9000000001', email: null, address: null })
  })
})

describe('InvoicePage', () => {
  function showInvoice(state?: unknown) {
    return renderApp(
      <Routes>
        <Route path="/sales/:id" element={<InvoicePage />} />
      </Routes>,
      { state: readyState('manager'), route: '/sales/s1', routeState: state },
    )
  }
  it('shows the shop, customer, lines with IMEI snapshots, totals, the single manual payment and no tax claim', async () => {
    showInvoice()
    const article = await screen.findByRole('article', { name: 'Invoice TM/26-27/000001' })
    expect(within(article).getByText('Tirumala Mobiles')).toBeInTheDocument()
    expect(within(article).getByText('Ravi Kumar')).toBeInTheDocument()
    expect(within(article).getByText(`IMEI 1: ${IMEI}`)).toBeInTheDocument()
    expect(within(article).getByRole('table', { name: 'Invoice lines' })).toHaveTextContent('Nova Case Black')
    expect(within(article).getAllByText('₹19,800.00', { selector: 'dd' })).toHaveLength(2) // subtotal and total
    expect(article).toHaveTextContent('Payment received: ₹19,800.00 by Cash (ref. till 1)')
    expect(article).toHaveTextContent('recorded manually')
    expect(article).toHaveTextContent('It carries no tax breakdown')
    expect(article).not.toHaveTextContent(/GST/i)
  })
  it('prints through the browser print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    showInvoice()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Print (A4)' }))
    expect(print).toHaveBeenCalled()
  })
  it('shows the discount and its reason when there was one', async () => {
    vi.mocked(sales.getInvoiceBySale).mockResolvedValue({ ...invoice, discount_total: 1000, subtotal: 20000, grand_total: 19000, sale: { ...invoice.sale!, discount_reason: 'Festival offer', discount_basis: 'manager_approval' } })
    showInvoice()
    expect(await screen.findByText('Discount reason: Festival offer')).toBeInTheDocument()
  })
  it('shows a load error with retry', async () => {
    vi.mocked(sales.getInvoiceBySale).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockResolvedValue(invoice)
    showInvoice()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })
})

describe('SalesPage', () => {
  const row = { id: 'i1', sale_id: 's1', invoice_number: 'TM/26-27/000001', issued_at: '2026-10-18T10:00:00Z', customer_name: 'Ravi Kumar', subtotal: 19800, discount_total: 0, grand_total: 19800, payments: [{ method: 'upi' as const }], sale: { sold_by: '11111111-1111-1111-1111-111111111111' } }
  function showSales() {
    return renderApp(<Routes><Route path="/sales" element={<SalesPage />} /></Routes>, { state: readyState('manager'), route: '/sales' })
  }
  it('lists sales with a link to each invoice, and searches by invoice or customer', async () => {
    vi.mocked(sales.listSales).mockResolvedValue({ rows: [row], total: 1 })
    showSales()
    const table = await screen.findByRole('table', { name: 'Sales' })
    expect(within(table).getByRole('link', { name: 'TM/26-27/000001' })).toHaveAttribute('href', '/sales/s1')
    expect(within(table).getByText('UPI')).toBeInTheDocument()
    expect(await within(table).findByText('Mohan Manager')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Search sales'), 'ravi{Enter}')
    await waitFor(() => expect(sales.listSales).toHaveBeenLastCalledWith({ page: 1, term: 'ravi' }))
  })
  it('shows empty and error states', async () => {
    vi.mocked(sales.listSales).mockResolvedValueOnce({ rows: [], total: 0 })
    const { unmount } = showSales()
    expect(await screen.findByText(/No sales yet/)).toBeInTheDocument()
    unmount()
    vi.mocked(sales.listSales).mockRejectedValue(new AppError('Cannot reach the server.', 'network'))
    showSales()
    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument()
  })
})

describe('ApprovalsPage and navigation', () => {
  it('Admin grants an approval after validation and sees the server-confirmed expiry', async () => {
    vi.mocked(sales.listApprovals).mockResolvedValue([])
    vi.mocked(settings.listStaff).mockResolvedValue([
      { user_id: '11111111-1111-1111-1111-111111111111', full_name: 'Asha Admin', role: 'admin', phone: null, is_active: true, created_at: '' },
      { user_id: 'u-mgr', full_name: 'Mohan Manager', role: 'manager', phone: null, is_active: true, created_at: '' },
    ])
    vi.mocked(sales.grantDiscountApproval).mockResolvedValue({ approval_id: 'ap1', expires_at: new Date(Date.now() + 900_000).toISOString(), replayed: false })
    vi.mocked(sales.listSellableDevices).mockResolvedValue([device()])
    vi.mocked(sales.listSellableAccessories).mockResolvedValue([acc])
    const user = userEvent.setup()
    renderApp(<Routes><Route path="/approvals" element={<ApprovalsPage />} /></Routes>, { state: readyState('admin'), route: '/approvals' })
    await user.click(await screen.findByRole('button', { name: 'Grant approval' }))
    expect(await screen.findByText('Choose who the approval is for.')).toBeInTheDocument()
    expect(await screen.findByText('Choose the phone or accessory this approval is for.')).toBeInTheDocument()
    expect(sales.grantDiscountApproval).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText(/Find the phone or accessory/), 'nova x1')
    await user.click(await screen.findByRole('button', { name: /IMEI ending 7518/ }))
    expect(screen.getByText(/Nova X1 Black 8GB RAM 128GB · IMEI ending 7518/)).toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText('For'), 'u-mgr')
    await user.type(screen.getByLabelText('Largest discount on this item (₹)'), '1500')
    await user.type(screen.getByLabelText('Reason'), 'Festival offer')
    await user.click(screen.getByRole('button', { name: 'Grant approval' }))
    expect(await screen.findByText(/Confirmed by the server: approval granted/)).toBeInTheDocument()
    expect(sales.grantDiscountApproval).toHaveBeenCalledWith({ requestedFor: 'u-mgr', maxAmount: 1500, reason: 'Festival offer', validMinutes: 15, inventoryItemId: 'd1' }, expect.any(String))
  })
  it('a Manager cannot open the approvals page, and the POS links are visible to both roles', async () => {
    renderApp(<AppRoutes />, { state: readyState('manager'), route: '/approvals' })
    expect(await screen.findByText('Not allowed')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Discount approvals' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New sale' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sales' })).toBeInTheDocument()
  })
})
