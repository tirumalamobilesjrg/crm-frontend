import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen } from '@testing-library/react'
import { ProductDetailPage } from './ProductDetailPage'
import { readyState, renderApp } from '../../test/utils'
import * as api from '../../api/catalogue'

vi.mock('../../api/catalogue')
vi.mock('../../api/productMedia')

function show(routeState?: unknown) {
  return renderApp(
    <Routes>
      <Route path="/catalogue/products/:id" element={<ProductDetailPage />} />
    </Routes>,
    { state: readyState('manager'), route: '/catalogue/products/p1', routeState },
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

  it('does not open it on an ordinary visit', async () => {
    show()
    expect(await screen.findByText('Nova X1')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
