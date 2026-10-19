import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductDetailPage } from './ProductDetailPage'
import { readyState, renderApp } from '../../test/utils'
import * as catalogue from '../../api/catalogue'
import * as purchasing from '../../api/purchasing'
import { AppError } from '../../lib/errors'
import type { Variant } from '../../lib/types'

vi.mock('../../api/catalogue')
vi.mock('../../api/productMedia')
vi.mock('../../api/purchasing')

const variant = (over: Partial<Variant> = {}): Variant => ({
  id: 'v1', product_id: 'p1', sku: 'NOVA-X1', color: 'Black', ram_gb: 8, storage_gb: 128, mrp: 20000, selling_price: 19000,
  public_price: null, public_price_approved_at: null, is_active: true, tracking_mode: 'serialized', ...over,
})

function show(role: 'admin' | 'manager' = 'manager') {
  return renderApp(
    <Routes>
      <Route path="/catalogue/products/:id" element={<ProductDetailPage />} />
      <Route path="/purchasing/purchases/:id" element={<p>Purchase page</p>} />
    </Routes>,
    { state: readyState(role), route: '/catalogue/products/p1' },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(catalogue.getProduct).mockResolvedValue({
    id: 'p1', brand_id: 'b', category_id: 'c', name: 'Nova X1', slug: 'nova-x1', description: null, is_published: false,
    published_at: null, updated_at: '2026-01-01', brand: { name: 'Nova' }, category: { name: 'Phones' },
  })
  vi.mocked(catalogue.listVariants).mockResolvedValue([variant(), variant({ id: 'v2', sku: 'OLD', is_active: false }), variant({ id: 'v3', sku: 'CASE', tracking_mode: 'quantity', color: null, ram_gb: null, storage_gb: null })])
  vi.mocked(purchasing.listSuppliers).mockResolvedValue([
    { id: 's1', name: 'Metro Traders', is_active: true } as never,
    { id: 's2', name: 'Closed Co', is_active: false } as never,
  ])
  vi.mocked(purchasing.createPurchase).mockResolvedValue({ id: 'pu1' } as never)
  vi.mocked(purchasing.addPurchaseLine).mockResolvedValue(undefined as never)
})

const fill = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
  await user.selectOptions(within(dialog).getByLabelText('Supplier'), 's1')
  await user.type(within(dialog).getByLabelText('Supplier invoice number'), 'INV-9')
  const qty = within(dialog).getByLabelText(/Number of phones|Quantity/)
  await user.clear(qty)
  await user.type(qty, '3')
  await user.type(within(dialog).getByLabelText(/Cost per unit/), '15000')
}

describe('Add stock from the product page', () => {
  it('offers Add stock to a Manager and an Admin for each active variant, not for an inactive one', async () => {
    show('manager')
    expect(await screen.findByRole('button', { name: 'Add stock for NOVA-X1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add stock for CASE' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add stock for OLD' })).not.toBeInTheDocument()
  })

  it('validates, then starts a draft purchase with this variant as its line and opens it', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Add stock for NOVA-X1' }))
    const dialog = await screen.findByRole('dialog', { name: /Add stock: Nova X1 Black 128 GB/ })
    expect(within(dialog).getByText(/IMEI of each phone/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: 'Closed Co' })).not.toBeInTheDocument() // inactive suppliers are not offered
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(await within(dialog).findByText('Choose a supplier.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Enter the supplier invoice number/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Enter the cost per unit/)).toBeInTheDocument()
    expect(purchasing.createPurchase).not.toHaveBeenCalled()

    await fill(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Purchase page')).toBeInTheDocument()
    expect(purchasing.createPurchase).toHaveBeenCalledWith(expect.objectContaining({ supplier_id: 's1', supplier_invoice_no: 'INV-9' }))
    expect(purchasing.addPurchaseLine).toHaveBeenCalledWith({ purchase_id: 'pu1', variant_id: 'v1', quantity: 3, unit_cost: 15000 })
  })

  it('says what happens next for an accessory', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Add stock for CASE' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Quantity')).toBeInTheDocument()
    expect(within(dialog).queryByText(/IMEI of each phone/)).not.toBeInTheDocument()
  })

  it('still opens the draft, and says why, when only the line could not be added', async () => {
    vi.mocked(purchasing.addPurchaseLine).mockRejectedValue(new AppError('That change was not applied.', 'no_rows'))
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Add stock for NOVA-X1' }))
    await fill(user, await screen.findByRole('dialog'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Purchase page')).toBeInTheDocument()
    expect(screen.getByText(/Draft purchase created, but this item could not be added: That change was not applied/)).toBeInTheDocument()
  })

  it('shows the reason and stays on the page when the purchase itself cannot be created', async () => {
    vi.mocked(purchasing.createPurchase).mockRejectedValue(new AppError('You do not have permission to do that.', '42501'))
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Add stock for NOVA-X1' }))
    await fill(user, await screen.findByRole('dialog'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(purchasing.addPurchaseLine).not.toHaveBeenCalled()
  })

  it('points to the Suppliers page when there are no suppliers yet', async () => {
    vi.mocked(purchasing.listSuppliers).mockResolvedValue([])
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Add stock for NOVA-X1' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('link', { name: 'Add a supplier' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeDisabled()
  })
})
