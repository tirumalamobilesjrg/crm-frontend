import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FindItemBox } from './FindItemBox'
import type { SellableAccessory, SellableDevice } from '../../lib/types'

const v = { id: 'v1', sku: 'NOVA-X1', color: 'Black', ram_gb: 8, storage_gb: 128, mrp: 20000, selling_price: 19000, is_active: true, product: { name: 'X1', brand: { name: 'Nova' } } }
const d = (id: string, imei: string): SellableDevice => ({ id, variant_id: 'v1', imei1: imei, imei2: null, serial_number: null, status: 'in_stock', variant: v })
const devices = [d('d1', '352000000000018'), d('d2', '352000000000026')]
const accessories: SellableAccessory[] = [{ id: 'c1', sku: 'CASE', color: 'Black', mrp: 500, selling_price: 400, is_active: true, product: { name: 'Case', brand: { name: 'Nova' } }, on_hand: 4 }]

const show = (over: Partial<Parameters<typeof FindItemBox>[0]> = {}) => {
  const onPick = vi.fn()
  render(<FindItemBox devices={devices} accessories={accessories} cart={[]} loading={false} failed={false} onPick={onPick} {...over} />)
  return onPick
}

describe('FindItemBox', () => {
  it('shows matches as the cashier types and adds the one clicked', async () => {
    const onPick = show()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Find an item to sell'), 'nova 0026')
    const list = screen.getByRole('list', { name: 'Matching items' })
    expect(list).toHaveTextContent('IMEI ending 0026')
    expect(list).toHaveTextContent('₹19,000.00')
    await user.click(screen.getByRole('button', { name: /IMEI ending 0026/ }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ key: 'd:d2' }))
    expect(screen.getByLabelText('Find an item to sell')).toHaveValue('')
  })
  it('Enter adds the first match, so typing "case" then Enter is enough', async () => {
    const onPick = show()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Find an item to sell'), 'case{Enter}')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ key: 'a:c1' }))
  })
  it('says so when nothing matches and never calls onPick', async () => {
    const onPick = show()
    await userEvent.setup().type(screen.getByLabelText('Find an item to sell'), 'iphone{Enter}')
    expect(screen.getByText(/No phone or accessory in stock matches/)).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })
  it('explains how to carry on when the stock list could not be loaded', () => {
    show({ failed: true })
    expect(screen.getByText(/Stock could not be loaded. Scan the IMEI instead/)).toBeInTheDocument()
  })
})
