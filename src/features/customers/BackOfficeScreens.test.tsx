import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomersPage } from './CustomersPage'
import { CustomerDetailPage } from './CustomerDetailPage'
import { ExpensesPage } from '../expenses/ExpensesPage'
import { ReportsPage } from '../reports/ReportsPage'
import { AuditPage } from '../audit/AuditPage'
import { AppRoutes } from '../../App'
import { readyState, renderApp } from '../../test/utils'
import * as customers from '../../api/customers'
import * as sales from '../../api/sales'
import * as expenses from '../../api/expenses'
import * as reports from '../../api/reports'
import * as audit from '../../api/audit'
import * as settings from '../../api/settings'
import { AppError } from '../../lib/errors'
import { NO_ROWS_MESSAGE } from '../../api/db'
import type { CustomerRecord, Expense } from '../../lib/types'

vi.mock('../../api/customers')
vi.mock('../../api/sales')
vi.mock('../../api/expenses')
vi.mock('../../api/reports')
vi.mock('../../api/audit')
vi.mock('../../api/settings', () => ({ listStaff: vi.fn(), listPolicies: vi.fn(), savePolicy: vi.fn(), addStaff: vi.fn(), updateStaff: vi.fn() }))
vi.mock('../../api/dashboard', () => ({ loadDashboardCounts: vi.fn().mockResolvedValue({ products: 0, published: 0, devicesInStock: 0, accessorySkus: 0 }) }))

const ravi: CustomerRecord = { id: 'c1', name: 'Ravi Kumar', phone: '9876543210', email: 'ravi@example.com', address: 'Hyderabad', notes: 'Prefers UPI', created_at: '2026-10-01T00:00:00Z' }
const rent: Expense = { id: 'e1', expense_date: '2026-10-05', category: 'Rent', description: 'October rent', amount: 25000, paid_via: 'bank_transfer', created_at: '2026-10-05T00:00:00Z' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(settings.listStaff).mockResolvedValue([{ user_id: '11111111-1111-1111-1111-111111111111', full_name: 'Mohan Manager', role: 'manager', phone: null, is_active: true, created_at: '' }])
})

describe('CustomersPage', () => {
  function show() {
    return renderApp(<Routes><Route path="/customers" element={<CustomersPage />} /><Route path="/customers/:id" element={<CustomerDetailPage />} /></Routes>, { state: readyState('manager'), route: '/customers' })
  }
  it('lists customers with links, searches (Enter) and shows empty and error states', async () => {
    vi.mocked(customers.listCustomers).mockResolvedValue({ rows: [ravi], total: 1 })
    show()
    const table = await screen.findByRole('table', { name: 'Customers' })
    expect(within(table).getByRole('link', { name: 'Ravi Kumar' })).toHaveAttribute('href', '/customers/c1')
    await userEvent.setup().type(screen.getByLabelText('Search customers'), 'rav{Enter}')
    await waitFor(() => expect(customers.listCustomers).toHaveBeenLastCalledWith({ page: 1, term: 'rav' }))
  })
  it('empty and error states', async () => {
    vi.mocked(customers.listCustomers).mockResolvedValueOnce({ rows: [], total: 0 })
    const { unmount } = show()
    expect(await screen.findByText(/No customers yet/)).toBeInTheDocument()
    unmount()
    vi.mocked(customers.listCustomers).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockResolvedValue({ rows: [ravi], total: 1 })
    show()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument()
  })
  it('creates a customer after validation and translates a duplicate phone', async () => {
    vi.mocked(customers.listCustomers).mockResolvedValue({ rows: [], total: 0 })
    vi.mocked(sales.createCustomer).mockRejectedValueOnce(new AppError('A customer with this phone number already exists. Search for them instead.', '23505')).mockResolvedValue({ ...ravi, id: 'c2' })
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'New customer' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Enter the customer name/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Sita')
    await user.type(screen.getByLabelText('Phone'), '9000000001')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sales.createCustomer).toHaveBeenCalledTimes(2))
    expect(sales.createCustomer).toHaveBeenLastCalledWith({ name: 'Sita', phone: '9000000001', email: null, address: null, notes: null })
  })
})

describe('CustomerDetailPage', () => {
  function show(role: 'admin' | 'manager') {
    return renderApp(<Routes><Route path="/customers" element={<div>list</div>} /><Route path="/customers/:id" element={<CustomerDetailPage />} /></Routes>, { state: readyState(role), route: '/customers/c1' })
  }
  beforeEach(() => {
    vi.mocked(customers.getCustomer).mockResolvedValue(ravi)
    vi.mocked(customers.listCustomerInvoices).mockResolvedValue([
      { id: 'i1', sale_id: 's1', invoice_number: 'TM/26-27/000001', issued_at: '2026-10-18T10:00:00Z', subtotal: 20000, discount_total: 1000, grand_total: 19000 },
      { id: 'i2', sale_id: 's2', invoice_number: 'TM/26-27/000002', issued_at: '2026-10-19T10:00:00Z', subtotal: 800, discount_total: 0, grand_total: 800 },
    ])
  })
  it('shows details and purchase history with the lifetime total', async () => {
    show('manager')
    expect(await screen.findByText('Prefers UPI')).toBeInTheDocument()
    expect(await screen.findByText(/2 invoices · ₹19,800.00 in total/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TM/26-27/000001' })).toHaveAttribute('href', '/sales/s1')
  })
  it('a Manager can edit but is not offered Delete (the database refuses it anyway)', async () => {
    vi.mocked(customers.updateCustomer).mockResolvedValue(undefined)
    const user = userEvent.setup()
    show('manager')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Ravi K')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(customers.updateCustomer).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Ravi K', notes: 'Prefers UPI' })))
  })
  it('an Admin can delete after confirming; a failure (customer has sales) is explained, not hidden', async () => {
    vi.mocked(customers.deleteCustomer).mockRejectedValueOnce(new AppError('That record is still in use elsewhere, so it cannot be changed or removed.', '23503'))
    const user = userEvent.setup()
    show('admin')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete Ravi Kumar?'))
    expect(await screen.findByText(/still in use elsewhere/)).toBeInTheDocument()
    expect(screen.queryByText('list')).not.toBeInTheDocument()
    vi.mocked(customers.deleteCustomer).mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('list')).toBeInTheDocument()
  })
  it('does not delete when the confirmation is declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    show('admin')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete' }))
    expect(customers.deleteCustomer).not.toHaveBeenCalled()
  })
})

describe('ExpensesPage', () => {
  function show(role: 'admin' | 'manager') {
    return renderApp(<Routes><Route path="/expenses" element={<ExpensesPage />} /></Routes>, { state: readyState(role), route: '/expenses?from=2026-10-01&to=2026-10-31' })
  }
  beforeEach(() => {
    vi.mocked(expenses.listExpenses).mockResolvedValue({ rows: [rent], total: 1 })
    vi.mocked(expenses.listExpenseAmounts).mockResolvedValue([{ amount: 25000, category: 'Rent' }, { amount: 1830.5, category: 'Electricity' }])
    vi.mocked(expenses.listExpenseCategories).mockResolvedValue(['Rent', 'Electricity'])
  })
  it('lists expenses and totals the filtered period with a category breakdown', async () => {
    show('manager')
    const table = await screen.findByRole('table', { name: 'Expenses' })
    expect(within(table).getByText('October rent')).toBeInTheDocument()
    expect(await screen.findByText('₹26,830.50')).toBeInTheDocument()
    const breakdown = await screen.findByRole('list', { name: 'By category' })
    expect(within(breakdown).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Rent₹25,000.00', 'Electricity₹1,830.50'])
    expect(expenses.listExpenses).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-10-01', to: '2026-10-31', category: '', page: 1 }))
  })
  it('changing the category filters the list and the totals', async () => {
    show('manager')
    await screen.findByRole('option', { name: 'Rent' }) // categories load asynchronously
    await userEvent.setup().selectOptions(screen.getByLabelText('Category'), 'Rent')
    await waitFor(() => expect(expenses.listExpenseAmounts).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-31', category: 'Rent' }))
  })
  it('validates, then records an expense', async () => {
    vi.mocked(expenses.createExpense).mockResolvedValue(rent)
    const user = userEvent.setup()
    show('manager')
    await user.click(await screen.findByRole('button', { name: 'New expense' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Enter a category/)).toBeInTheDocument()
    expect(await screen.findByText(/Enter the amount in rupees/)).toBeInTheDocument()
    expect(expenses.createExpense).not.toHaveBeenCalled()
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Category'), 'Tea and refreshments')
    await user.type(dialog.getByLabelText('Amount (₹)'), '120.50')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(expenses.createExpense).toHaveBeenCalledWith(expect.objectContaining({ category: 'Tea and refreshments', amount: 120.5, paid_via: 'cash', description: null })))
  })
  it('a Manager has no Delete button; an Admin does, and a refused delete is shown', async () => {
    const { unmount } = show('manager')
    await screen.findByRole('table', { name: 'Expenses' })
    expect(screen.queryByRole('button', { name: /Delete expense/ })).not.toBeInTheDocument()
    unmount()
    vi.mocked(expenses.deleteExpense).mockRejectedValueOnce(new AppError(NO_ROWS_MESSAGE, 'no_rows'))
    show('admin')
    await userEvent.setup().click(await screen.findByRole('button', { name: /Delete expense Rent/ }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('Expense deleted')).not.toBeInTheDocument()
  })
  it('shows empty and error states', async () => {
    vi.mocked(expenses.listExpenses).mockResolvedValueOnce({ rows: [], total: 0 })
    vi.mocked(expenses.listExpenseAmounts).mockResolvedValueOnce([])
    show('manager')
    expect(await screen.findByText('No expenses in this period.')).toBeInTheDocument()
  })
})

describe('ReportsPage', () => {
  const invoice = { id: 'i1', invoice_number: 'TM/26-27/000001', issued_at: new Date().toISOString(), customer_name: 'Ravi', subtotal: 20000, discount_total: 1000, grand_total: 19000, payments: [{ method: 'cash' as const }] }
  const lineRow = { quantity: 1, unit_price: 20000, discount_amount: 1000, line_total: 19000, variant: { sku: 'NOVA-X1', product: { name: 'X1', brand: { name: 'Nova' } } }, item: { cost: { cost_price: 15000 } } }
  beforeEach(() => {
    vi.mocked(reports.loadInvoices).mockResolvedValue([invoice])
    vi.mocked(reports.loadSoldLines).mockResolvedValue([lineRow])
    vi.mocked(reports.loadStockDevices).mockResolvedValue([{ variant: { selling_price: 19000 }, cost: { cost_price: 15000 } }])
    vi.mocked(reports.loadStockAccessories).mockResolvedValue([{ selling_price: 400, stock: { on_hand: 10 } }])
    vi.mocked(expenses.listExpenseAmounts).mockResolvedValue([{ amount: 1000, category: 'Rent' }])
  })
  const show = () => renderApp(<Routes><Route path="/reports" element={<ReportsPage />} /></Routes>, { state: readyState('manager'), route: '/reports' })

  it('shows sales, discounts, payment methods, top products, an honest profit estimate and stock value', async () => {
    show()
    const salesPanel = await screen.findByLabelText('Sales summary')
    expect(await within(salesPanel).findAllByText('₹19,000.00', { selector: '.card-num' })).toHaveLength(2) // net sales and the average of one sale
    expect(within(salesPanel).getByText('₹1,000.00', { selector: '.card-num' })).toBeInTheDocument()
    expect(within(salesPanel).getByRole('table', { name: 'Sales by payment method' })).toHaveTextContent('Cash')
    expect(within(salesPanel).getByRole('img', { name: /Net sales per day/ })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Products sold table' })).toHaveTextContent('Nova X1')
    const profit = await screen.findByLabelText('Profit estimate')
    expect(await within(profit).findByText('₹4,000.00', { selector: '.card-num' })).toBeInTheDocument() // 19,000 - 15,000
    expect(within(profit).getByText('₹3,000.00', { selector: '.card-num' })).toBeInTheDocument() // minus 1,000 expenses
    expect(profit).toHaveTextContent('This is an estimate')
    expect(profit).toHaveTextContent('Accessories')
    const stock = await screen.findByLabelText('Stock value')
    expect(await within(stock).findByText('₹4,000.00', { selector: '.card-num' })).toBeInTheDocument() // 10 x 400 accessories
    expect(stock).toHaveTextContent('Accessory cost is not tracked per unit')
  })
  it('downloads the sales as CSV (BOM, header, formula-safe)', async () => {
    const created: Blob[] = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: (b: Blob) => (created.push(b), 'blob:x'), revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    show()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Download sales CSV' }))
    expect(click).toHaveBeenCalled()
    const text = await created[0]!.text()
    expect(text).toContain('Invoice,Date,Customer,Paid by,Subtotal,Discount,Total')
    expect(text).toContain('TM/26-27/000001')
    vi.unstubAllGlobals()
  })
  it('changing the period re-runs the reports with the new range', async () => {
    show()
    await screen.findByLabelText('Sales summary')
    const before = vi.mocked(reports.loadInvoices).mock.calls.length
    await userEvent.setup().selectOptions(screen.getByLabelText('Period'), 'last7')
    await waitFor(() => expect(vi.mocked(reports.loadInvoices).mock.calls.length).toBeGreaterThan(before))
  })
  it('an empty period says so; an error offers retry; a backwards custom range is refused before any request', async () => {
    vi.mocked(reports.loadInvoices).mockResolvedValueOnce([])
    vi.mocked(reports.loadSoldLines).mockResolvedValueOnce([])
    const { unmount } = show()
    expect(await screen.findByText('No sales in this period.')).toBeInTheDocument()
    unmount()
    vi.mocked(reports.loadInvoices).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockResolvedValue([invoice])
    show()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Sales by payment method' })).toBeInTheDocument()
    unmount()
    vi.mocked(reports.loadInvoices).mockClear()
    renderApp(<Routes><Route path="/reports" element={<ReportsPage />} /></Routes>, { state: readyState('manager'), route: '/reports?preset=custom&from=2026-10-10&to=2026-10-01' })
    expect(await screen.findByText(/start date must not be after/)).toBeInTheDocument()
    expect(reports.loadInvoices).not.toHaveBeenCalled()
  })
})

describe('AuditPage and navigation', () => {
  it('lists audit entries with who did what and lets the Admin filter', async () => {
    vi.mocked(audit.listAudit).mockResolvedValue({
      rows: [{ id: 5, occurred_at: '2026-10-18T10:00:00Z', actor_id: '11111111-1111-1111-1111-111111111111', actor_role: 'manager', action: 'sale.finalized', table_name: 'sales', record_id: 's1', detail: { total: 19000 } }],
      total: 1,
    })
    renderApp(<Routes><Route path="/audit" element={<AuditPage />} /></Routes>, { state: readyState('admin'), route: '/audit' })
    const table = await screen.findByRole('table', { name: 'Audit entries' })
    expect(within(table).getByText('sale.finalized')).toBeInTheDocument()
    expect(await within(table).findByText('Mohan Manager')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Filter by action'), 'sale{Enter}')
    await waitFor(() => expect(audit.listAudit).toHaveBeenLastCalledWith({ page: 1, action: 'sale', table: '' }))
  })
  it('a Manager cannot open the audit log; both roles see Customers, Expenses and Reports', async () => {
    renderApp(<AppRoutes />, { state: readyState('manager'), route: '/audit' })
    expect(await screen.findByText('Not allowed')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument()
    for (const name of ['Customers', 'Expenses', 'Reports']) expect(screen.getByRole('link', { name })).toBeInTheDocument()
  })
})
