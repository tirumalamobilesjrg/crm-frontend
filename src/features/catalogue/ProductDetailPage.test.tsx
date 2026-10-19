import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen } from '@testing-library/react'
import { ProductDetailPage } from './ProductDetailPage'
import { readyState, renderApp } from '../../test/utils'
import * as api from '../../api/catalogue'

vi.mock('../../api/catalogue')
vi.mock('../../api/productMedia')

function show(routeState?: unknown, role: 'admin' | 'manager' = 'admin') {
  return renderApp(
    <Routes>
      <Route path="/catalogue/products/:id" element={<ProductDetailPage />} />
    </Routes>,
    { state: readyState(role), route: '/catalogue/products/p1', routeState },
  )
}

describe('ProductDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.getProduct).mockResolvedValue({
      id: 'p1', brand_id: 'b', category_id: 'c', name: 'Nova X1', slug: 'nova-x1', description: null, is_published: false,
      published_at: null, updated_at: '2026-01-01', brand: { name: 'Nova' }, category: { name: 'Phones' },
    })
    vi.mocked(api.listVariants).mockResolvedValue([])
  })

  it('opens the Add variant dialog straight after a product is created', async () => {
    show({ addVariant: true })
    expect(await screen.findByRole('dialog', { name: 'New variant' })).toBeInTheDocument()
  })

  it('a Manager cannot add or edit variants (prices are Admin-only) and is told why', async () => {
    vi.mocked(api.listVariants).mockResolvedValue([{ id: 'v1', product_id: 'p1', sku: 'NOVA-X1', color: null, ram_gb: null, storage_gb: null, mrp: 20000, selling_price: 19000, public_price: null, public_price_approved_at: null, is_active: true, tracking_mode: 'serialized' }])
    show({ addVariant: true }, 'manager')
    expect(await screen.findByText(/Only an Admin can add variants or change prices/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add variant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open it on an ordinary visit', async () => {
    show()
    expect(await screen.findByText('Nova X1')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
