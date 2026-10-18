import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductsPage } from './ProductsPage'
import { readyState, renderApp } from '../../test/utils'
import * as api from '../../api/catalogue'
import { AppError } from '../../lib/errors'
import type { ProductRow } from '../../lib/types'

vi.mock('../../api/catalogue')

const row = (over: Partial<ProductRow>): ProductRow => ({
  id: 'p1', brand_id: 'b', category_id: 'c', name: 'Nova X1', slug: 'nova-x1', description: null,
  is_published: false, published_at: null, updated_at: '2026-01-01', brand: { name: 'Nova' }, category: { name: 'Phones' }, ...over,
})

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.listProducts).mockResolvedValue([row({}), row({ id: 'p2', name: 'Case Black', is_published: true, category: { name: 'Accessories' } })])
    vi.mocked(api.listBrands).mockResolvedValue([])
    vi.mocked(api.listCategories).mockResolvedValue([])
    vi.mocked(api.setPublished).mockResolvedValue(null as never)
  })

  it('lists products with their website status and filters by search', async () => {
    renderApp(<ProductsPage />, { state: readyState('manager') })
    expect(await screen.findByText('Nova X1')).toBeInTheDocument()
    expect(screen.getByText('Published')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Search products'), 'accessories')
    expect(screen.queryByText('Nova X1')).not.toBeInTheDocument()
    expect(screen.getByText('Case Black')).toBeInTheDocument()
  })

  it('asks for confirmation before publishing, and only then calls the API', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    renderApp(<ProductsPage />, { state: readyState('manager') })
    const user = userEvent.setup()
    const rowEl = (await screen.findByText('Nova X1')).closest('tr')!
    confirm.mockReturnValueOnce(false)
    await user.click(within(rowEl).getByRole('button', { name: 'Publish' }))
    expect(api.setPublished).not.toHaveBeenCalled()
    confirm.mockReturnValueOnce(true)
    await user.click(within(rowEl).getByRole('button', { name: 'Publish' }))
    expect(api.setPublished).toHaveBeenCalledWith('p1', true)
  })

  it('shows the database error message when publishing is refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.setPublished).mockRejectedValue(new AppError('You do not have permission to do that.', '42501'))
    renderApp(<ProductsPage />, { state: readyState('manager') })
    const rowEl = (await screen.findByText('Nova X1')).closest('tr')!
    await userEvent.setup().click(within(rowEl).getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument()
  })
})
