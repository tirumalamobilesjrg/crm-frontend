import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardPage } from './DashboardPage'
import { readyState, renderApp } from '../../test/utils'
import * as dashboard from '../../api/dashboard'
import * as inventory from '../../api/inventory'
import * as reports from '../../api/reports'
import * as sales from '../../api/sales'
import { AppError } from '../../lib/errors'

vi.mock('../../api/dashboard')
vi.mock('../../api/inventory', () => ({ listAccessories: vi.fn(), loadInventorySummary: vi.fn(), PAGE_SIZE: 25 }))
vi.mock('../../api/reports')
vi.mock('../../api/sales')

const stock = { inStock: 12, damaged: 0, lost: 0, returnedToSupplier: 0, sold: 3, accessorySkusInStock: 2, accessoryUnits: 40, accessoryUnitsTruncated: false }
const acc = (id: string, on_hand: number, is_active = true) => ({ id, sku: id, color: null, is_active, product: null, on_hand })
const now = () => new Date().toISOString()
const invoice = (total: number, discount = 0, at = now()) => ({ id: String(Math.random()), invoice_number: 'TM/26-27/000001', issued_at: at, customer_name: 'Ravi', subtotal: total + discount, discount_total: discount, grand_total: total, payments: [{ method: 'cash' as const }] })
const row = (n: number) => ({ id: `i${n}`, sale_id: `s${n}`, invoice_number: `TM/26-27/00000${n}`, issued_at: now(), customer_name: n === 1 ? 'Ravi Kumar' : 'Walk-in customer', subtotal: 1000, discount_total: 0, grand_total: 1000 * n, payments: [{ method: 'upi' as const }], sale: { sold_by: 'u' } })

function show() {
  return renderApp(<Routes><Route path="/" element={<DashboardPage />} /></Routes>, { state: readyState('manager') })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(dashboard.loadDashboardCounts).mockResolvedValue({ products: 4, published: 3, devicesInStock: 12, accessorySkus: 2 })
  vi.mocked(dashboard.countDraftPurchases).mockResolvedValue(0)
  vi.mocked(inventory.loadInventorySummary).mockResolvedValue(stock)
  vi.mocked(inventory.listAccessories).mockResolvedValue([acc('A', 5)])
  vi.mocked(reports.loadInvoices).mockResolvedValue([])
  vi.mocked(sales.listSales).mockResolvedValue({ rows: [], total: 0 })
})

describe('DashboardPage', () => {
  it('greets the person and shows today\'s takings with the number of sales and discounts given', async () => {
    vi.mocked(reports.loadInvoices).mockResolvedValue([invoice(19000, 1000), invoice(500)])
    show()
    expect(await screen.findByRole('heading', { name: 'Welcome, Mohan Manager' })).toBeInTheDocument()
    const today = await screen.findByRole('region', { name: 'Today at the counter' })
    expect(await within(today).findByText('₹19,500.00')).toBeInTheDocument()
    expect(within(today).getByText(/2 sales today, ₹1,000.00 given as discount\./)).toBeInTheDocument()
  })

  it('says so when nothing has been sold today, and describes the 7-day strip in words', async () => {
    show()
    const today = await screen.findByRole('region', { name: 'Today at the counter' })
    expect(await within(today).findByText('No sales yet today.')).toBeInTheDocument()
    expect(within(today).getByText('₹0.00')).toBeInTheDocument()
    expect(within(today).getByRole('img', { name: /Net sales for the last 7 days:/ })).toBeInTheDocument()
  })

  it('counts only today in the headline but plots the whole week', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    vi.mocked(reports.loadInvoices).mockResolvedValue([invoice(7000, 0, yesterday), invoice(300)])
    show()
    const today = await screen.findByRole('region', { name: 'Today at the counter' })
    expect(await within(today).findByText('₹300.00')).toBeInTheDocument()
    expect(within(today).getByRole('img', { name: /₹7,000\.00/ })).toBeInTheDocument()
  })

  it('offers the three daily jobs as buttons', async () => {
    show()
    expect(await screen.findByRole('link', { name: /New sale/ })).toHaveAttribute('href', '/pos')
    expect(screen.getByRole('link', { name: /Receive stock/ })).toHaveAttribute('href', '/purchasing/purchases')
    expect(screen.getByRole('link', { name: /Add expense/ })).toHaveAttribute('href', '/expenses')
  })

  it('lists recent sales with links to the invoices', async () => {
    vi.mocked(sales.listSales).mockResolvedValue({ rows: [row(1), row(2)], total: 2 })
    show()
    const table = await screen.findByRole('table', { name: 'Latest invoices' })
    expect(within(table).getByRole('link', { name: 'TM/26-27/000001' })).toHaveAttribute('href', '/sales/s1')
    expect(within(table).getByText('Ravi Kumar')).toBeInTheDocument()
    expect(within(table).getAllByText('UPI')).toHaveLength(2)
  })

  it('an empty shop gets an invitation, not a blank table', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'No sales yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Make the first sale' })).toHaveAttribute('href', '/pos')
  })

  it('"Needs attention" lists out-of-stock accessories, damaged or lost phones and draft purchases, each with a link', async () => {
    vi.mocked(inventory.listAccessories).mockResolvedValue([acc('A', 0), acc('B', 0), acc('C', 3), acc('D', 0, false)])
    vi.mocked(inventory.loadInventorySummary).mockResolvedValue({ ...stock, damaged: 2, lost: 1 })
    vi.mocked(dashboard.countDraftPurchases).mockResolvedValue(1)
    show()
    const panel = await screen.findByRole('region', { name: 'Needs attention' })
    expect(await within(panel).findByText('2 accessory SKUs are out of stock')).toBeInTheDocument() // the inactive one is not counted
    expect(within(panel).getByText('3 phones are marked damaged or lost')).toBeInTheDocument()
    expect(within(panel).getByText('1 draft purchase is waiting to be received')).toBeInTheDocument()
    expect(within(panel).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/inventory?tab=accessories&stock=out', '/inventory?status=damaged', '/purchasing/purchases'])
  })

  it('says so when nothing needs attention', async () => {
    show()
    expect(await screen.findByText('Nothing needs attention right now.')).toBeInTheDocument()
  })

  it('shows the snapshot counts, products first', async () => {
    show()
    const cards = await screen.findByLabelText('Snapshot')
    expect(within(cards).getAllByText(/^\d+$/).map((n) => n.textContent)).toEqual(['4', '3', '12', '2'])
    expect(within(cards).getByText('Phones in stock')).toBeInTheDocument()
  })

  it('a failed section shows its own error and retries without hiding the others', async () => {
    vi.mocked(reports.loadInvoices).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockResolvedValue([invoice(100)])
    show()
    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument()
    expect(await screen.findByLabelText('Snapshot')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('₹100.00')).toBeInTheDocument()
  })
})
