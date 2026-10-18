import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InventoryPage } from './InventoryPage'
import { DeviceDetailPage } from './DeviceDetailPage'
import { AccessoryDetailPage } from './AccessoryDetailPage'
import { readyState, renderApp } from '../../test/utils'
import * as api from '../../api/inventory'
import * as settings from '../../api/settings'
import { AppError } from '../../lib/errors'
import type { AccessoryRow, InventoryItem, InventorySummary, StockMovement } from '../../lib/types'

vi.mock('../../api/inventory', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/inventory')>()), listDevices: vi.fn(), listAccessories: vi.fn(), listVariantIndex: vi.fn(), loadInventorySummary: vi.fn(), getDevice: vi.fn(), getDeviceCost: vi.fn(), listDeviceMovements: vi.fn(), listDeviceCorrections: vi.fn(), adjustDeviceStatus: vi.fn(), correctIdentifiers: vi.fn(), getAccessory: vi.fn(), listAccessoryMovements: vi.fn(), adjustAccessoryQuantity: vi.fn() }))
vi.mock('../../api/settings', () => ({ listStaff: vi.fn() }))

const A = '490154203237518'
const B = '356938035643809'

const summary: InventorySummary = { inStock: 12, damaged: 2, lost: 1, returnedToSupplier: 0, sold: 40, accessorySkusInStock: 3, accessoryUnits: 55, accessoryUnitsTruncated: false }
const device = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'd1', variant_id: 'v1', imei1: A, imei2: null, serial_number: null, status: 'in_stock', condition: 'new', shelf_location: null,
  received_at: '2026-10-18T00:00:00Z', updated_at: '2026-10-18T00:00:00Z',
  variant: { sku: 'NOVA-X1', color: 'Black', ram_gb: 8, storage_gb: 128, product: { name: 'X1', brand: { name: 'Nova' } } }, ...over,
})
const accessory = (over: Partial<AccessoryRow> = {}): AccessoryRow => ({ id: 'a1', sku: 'NOVA-CASE', color: 'Black', is_active: true, product: { name: 'Case', brand: { name: 'Nova' } }, on_hand: 20, ...over })
const receipt: StockMovement = { id: 1, movement_type: 'purchase_receipt', from_status: null, to_status: 'in_stock', quantity_delta: null, balance_after: null, created_by: 'u1', created_at: '2026-10-18T00:00:00Z', adjustment: null }

function showPage(route: string) {
  return renderApp(
    <Routes>
      <Route path="/inventory" element={<InventoryPage />} />
      <Route path="/inventory/devices/:id" element={<DeviceDetailPage />} />
      <Route path="/inventory/accessories/:id" element={<AccessoryDetailPage />} />
    </Routes>,
    { state: readyState('manager'), route },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(api.loadInventorySummary).mockResolvedValue(summary)
  vi.mocked(api.listVariantIndex).mockResolvedValue([{ id: 'v1', sku: 'NOVA-X1', color: 'Black', ram_gb: 8, storage_gb: 128, product: { name: 'X1', brand: { name: 'Nova' } } }])
  vi.mocked(api.listDevices).mockResolvedValue({ rows: [device()], total: 1 })
  vi.mocked(api.listAccessories).mockResolvedValue([accessory(), accessory({ id: 'a2', sku: 'NOVA-CABLE', on_hand: 0, product: { name: 'Cable', brand: { name: 'Nova' } } })])
  vi.mocked(settings.listStaff).mockResolvedValue([{ user_id: 'u1', full_name: 'Mohan Manager', role: 'manager', phone: null, is_active: true, created_at: '' }])
})

describe('InventoryPage', () => {
  it('shows summary counts and lists devices as individual units with their IMEIs', async () => {
    showPage('/inventory')
    expect(await screen.findByText('Phones in stock')).toBeInTheDocument()
    expect(screen.getByText('55')).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Devices' })
    expect(within(table).getByText(A)).toBeInTheDocument()
    expect(within(table).getByText('In stock')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: /Nova X1 Black 8GB RAM 128GB/ })).toHaveAttribute('href', '/inventory/devices/d1')
  })

  it('searches by IMEI (Enter submits, as a scanner does) and passes the sanitised term and status filter to the API', async () => {
    showPage('/inventory')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Search devices'), '4901542{Enter}')
    await waitFor(() => expect(api.listDevices).toHaveBeenLastCalledWith(expect.objectContaining({ identifierTerm: '4901542', page: 1 })))
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'damaged')
    await waitFor(() => expect(api.listDevices).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'damaged', identifierTerm: '4901542' })))
  })

  it('resolves a product-name search to variant ids', async () => {
    showPage('/inventory')
    await userEvent.setup().type(await screen.findByLabelText('Search devices'), 'nova x1{Enter}')
    await waitFor(() => expect(api.listDevices).toHaveBeenLastCalledWith(expect.objectContaining({ variantIds: ['v1'], identifierTerm: 'nova x1' })))
  })

  it('shows an empty state, and offers retry after an error', async () => {
    vi.mocked(api.listDevices).mockResolvedValueOnce({ rows: [], total: 0 })
    const { unmount } = showPage('/inventory')
    expect(await screen.findByText(/No devices yet/)).toBeInTheDocument()
    unmount()
    vi.mocked(api.listDevices).mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network')).mockResolvedValue({ rows: [device()], total: 1 })
    showPage('/inventory')
    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(A)).toBeInTheDocument()
  })

  it('paginates', async () => {
    vi.mocked(api.listDevices).mockResolvedValue({ rows: [device()], total: 60 })
    showPage('/inventory')
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(api.listDevices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('the Accessories tab shows quantities and filters out-of-stock SKUs, clearly apart from phones', async () => {
    showPage('/inventory?tab=accessories')
    const table = await screen.findByRole('table', { name: 'Accessories' })
    expect(within(table).getByText('NOVA-CASE')).toBeInTheDocument()
    expect(within(table).getByText('Out of stock')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Devices' })).not.toBeInTheDocument()
    await userEvent.setup().selectOptions(screen.getByLabelText('Filter by stock'), 'out')
    expect(within(table).queryByText('NOVA-CASE')).not.toBeInTheDocument()
    expect(within(table).getByText('NOVA-CABLE')).toBeInTheDocument()
  })
})

describe('DeviceDetailPage', () => {
  beforeEach(() => {
    vi.mocked(api.getDevice).mockResolvedValue(device())
    vi.mocked(api.getDeviceCost).mockResolvedValue({ cost_price: 15000 })
    vi.mocked(api.listDeviceMovements).mockResolvedValue([receipt])
    vi.mocked(api.listDeviceCorrections).mockResolvedValue([])
  })

  it('shows identifiers, cost, ledger and an empty identifier history', async () => {
    showPage('/inventory/devices/d1')
    expect(await screen.findByText(A)).toBeInTheDocument()
    expect(await screen.findByText('₹15,000.00')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Stock movements' })).toBeInTheDocument()
    expect(screen.getByText(/No corrections/)).toBeInTheDocument()
  })

  it('says so when the cost cannot be read, instead of showing a number', async () => {
    vi.mocked(api.getDeviceCost).mockResolvedValue(null)
    showPage('/inventory/devices/d1')
    expect(await screen.findByText('Not available to you')).toBeInTheDocument()
  })

  it('offers only the reasons the database allows for the current status, and none for a sold device', async () => {
    const user = userEvent.setup()
    showPage('/inventory/devices/d1')
    await user.click(await screen.findByRole('button', { name: 'Adjust status' }))
    const reasons = within(screen.getByLabelText('Reason')).getAllByRole('option').map((o) => o.textContent)
    expect(reasons).toEqual(['Choose…', 'Damaged', 'Lost', 'Returned to supplier'])
  })
  it('disables adjusting a sold device', async () => {
    vi.mocked(api.getDevice).mockResolvedValue(device({ status: 'sold' }))
    showPage('/inventory/devices/d1')
    expect(await screen.findByRole('button', { name: 'Adjust status' })).toBeDisabled()
  })

  it('validates, then shows the SERVER-confirmed result (not an assumption) and refreshes the device', async () => {
    vi.mocked(api.adjustDeviceStatus).mockResolvedValue({ adjustment_id: 'x', from_status: 'in_stock', to_status: 'lost', replayed: false })
    const user = userEvent.setup()
    showPage('/inventory/devices/d1')
    await user.click(await screen.findByRole('button', { name: 'Adjust status' }))
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    expect(await screen.findByText('Choose a reason.')).toBeInTheDocument()
    expect(api.adjustDeviceStatus).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByLabelText('Reason'), 'lost')
    await user.type(screen.getByLabelText('Notes'), 'Not on the shelf after the count')
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    expect(await screen.findByText(/Confirmed by the server/)).toHaveTextContent('from In stock to Lost')
    expect(api.adjustDeviceStatus).toHaveBeenCalledWith('d1', 'lost', 'Not on the shelf after the count', expect.any(String))
    await waitFor(() => expect(vi.mocked(api.getDevice).mock.calls.length).toBeGreaterThan(1)) // re-read from the server
  })

  it('reuses the idempotency key when the same adjustment is retried after a failure', async () => {
    vi.mocked(api.adjustDeviceStatus)
      .mockRejectedValueOnce(new AppError('Cannot reach the server.', 'network'))
      .mockResolvedValue({ adjustment_id: 'x', from_status: 'in_stock', to_status: 'damaged', replayed: false })
    const user = userEvent.setup()
    showPage('/inventory/devices/d1')
    await user.click(await screen.findByRole('button', { name: 'Adjust status' }))
    await user.selectOptions(screen.getByLabelText('Reason'), 'damaged')
    await user.type(screen.getByLabelText('Notes'), 'Cracked screen')
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    await screen.findByText('Cannot reach the server.')
    expect(screen.queryByText(/Confirmed by the server/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    await screen.findByText(/Confirmed by the server/)
    const [first, second] = vi.mocked(api.adjustDeviceStatus).mock.calls
    expect(second![3]).toBe(first![3])
  })

  it('corrects an identifier: validates, confirms, sends only the changed field, and shows the server confirmation', async () => {
    vi.mocked(api.correctIdentifiers).mockResolvedValue({ correction_id: 'c1', inventory_item_id: 'd1', replayed: false })
    const user = userEvent.setup()
    showPage('/inventory/devices/d1')
    await user.click(await screen.findByRole('button', { name: 'Correct IMEI / serial' }))
    await user.click(screen.getByRole('button', { name: 'Save correction' }))
    expect(await screen.findByText('Nothing has changed.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('IMEI 1'))
    await user.type(screen.getByLabelText('IMEI 1'), '490154203237519')
    await user.type(screen.getByLabelText('Reason for the correction'), 'Typed the last digit wrong')
    await user.click(screen.getByRole('button', { name: 'Save correction' }))
    expect(await screen.findByText(/check digit/)).toBeInTheDocument()
    expect(api.correctIdentifiers).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('IMEI 1'))
    await user.type(screen.getByLabelText('IMEI 1'), B)
    await user.click(screen.getByRole('button', { name: 'Save correction' }))
    expect(await screen.findByText(/the identifiers were corrected/)).toBeInTheDocument()
    expect(api.correctIdentifiers).toHaveBeenCalledWith('d1', { imei1: B }, 'Typed the last digit wrong', expect.any(String))
  })

  it('shows a duplicate IMEI rejection from the server and does not claim success', async () => {
    vi.mocked(api.correctIdentifiers).mockRejectedValue(new AppError(`IMEI ${B} is already recorded on another device.`, '23505'))
    const user = userEvent.setup()
    showPage('/inventory/devices/d1')
    await user.click(await screen.findByRole('button', { name: 'Correct IMEI / serial' }))
    await user.clear(screen.getByLabelText('IMEI 1'))
    await user.type(screen.getByLabelText('IMEI 1'), B)
    await user.type(screen.getByLabelText('Reason for the correction'), 'Scanned the wrong phone')
    await user.click(screen.getByRole('button', { name: 'Save correction' }))
    expect(await screen.findByText(/already recorded on another device/)).toBeInTheDocument()
    expect(screen.queryByText(/the identifiers were corrected/)).not.toBeInTheDocument()
  })

  it('lists the identifier history with who changed what', async () => {
    vi.mocked(api.listDeviceCorrections).mockResolvedValue([
      { id: 'c1', old_imei1: A, old_imei2: null, old_serial_number: null, new_imei1: B, new_imei2: null, new_serial_number: null, reason: 'Typed wrong', corrected_by: 'u1', created_at: '2026-10-18T10:00:00Z' },
    ])
    showPage('/inventory/devices/d1')
    const table = await screen.findByRole('table', { name: 'Identifier corrections' })
    expect(within(table).getByText(A)).toBeInTheDocument()
    expect(within(table).getByText(B)).toBeInTheDocument()
    expect(await within(table).findByText('Mohan Manager')).toBeInTheDocument()
  })

  it('re-reads the device after a failed adjustment, because it may have changed under the user', async () => {
    vi.mocked(api.adjustDeviceStatus).mockRejectedValue(new AppError('That item is not available (already sold, or not enough stock).', 'TM004'))
    const user = userEvent.setup()
    showPage('/inventory/devices/d1')
    await user.click(await screen.findByRole('button', { name: 'Adjust status' }))
    await user.selectOptions(screen.getByLabelText('Reason'), 'lost')
    await user.type(screen.getByLabelText('Notes'), 'Cannot find it')
    const before = vi.mocked(api.getDevice).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    await screen.findByText(/not available/)
    await waitFor(() => expect(vi.mocked(api.getDevice).mock.calls.length).toBeGreaterThan(before))
  })
})

describe('AccessoryDetailPage', () => {
  beforeEach(() => {
    vi.mocked(api.getAccessory).mockResolvedValue(accessory())
    vi.mocked(api.listAccessoryMovements).mockResolvedValue([
      { id: 2, movement_type: 'adjustment', from_status: null, to_status: null, quantity_delta: -5, balance_after: 15, created_by: 'u1', created_at: '2026-10-18T11:00:00Z', adjustment: { reason: 'damaged', notes: 'Water damage' } },
      { id: 1, movement_type: 'purchase_receipt', from_status: null, to_status: null, quantity_delta: 20, balance_after: 20, created_by: 'u1', created_at: '2026-10-18T10:00:00Z', adjustment: null },
    ])
  })

  it('shows the quantity and the movement history with balances and reasons, marked as an accessory', async () => {
    showPage('/inventory/accessories/a1')
    expect(await screen.findByText(/counted by quantity \(no IMEI\)/)).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Stock movements' })
    expect(within(table).getByText('-5')).toBeInTheDocument()
    expect(within(table).getByText(/Damaged: Water damage/)).toBeInTheDocument()
  })

  it('refuses to remove more than is on hand, without calling the server', async () => {
    const user = userEvent.setup()
    showPage('/inventory/accessories/a1')
    await user.click(await screen.findByRole('button', { name: 'Adjust stock' }))
    await user.type(screen.getByLabelText('Quantity'), '21')
    await user.selectOptions(screen.getByLabelText('Reason'), 'lost')
    await user.type(screen.getByLabelText('Notes'), 'Lost the box')
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    expect(await screen.findByText(/Only 20 in stock/)).toBeInTheDocument()
    expect(api.adjustAccessoryQuantity).not.toHaveBeenCalled()
  })

  it('sends a negative delta for a removal and shows the balance the server returns', async () => {
    vi.mocked(api.adjustAccessoryQuantity).mockResolvedValue({ adjustment_id: 'x', balance_after: 14, replayed: false })
    const user = userEvent.setup()
    showPage('/inventory/accessories/a1')
    await user.click(await screen.findByRole('button', { name: 'Adjust stock' }))
    await user.type(screen.getByLabelText('Quantity'), '5')
    await user.selectOptions(screen.getByLabelText('Reason'), 'damaged')
    await user.type(screen.getByLabelText('Notes'), 'Water damage')
    await user.click(screen.getByRole('button', { name: 'Record adjustment' }))
    const confirmed = await screen.findByText(/Confirmed by the server/)
    expect(confirmed).toHaveTextContent('-5 recorded')
    expect(confirmed).toHaveTextContent('New balance: 14') // the server's number, not 20 - 5 computed here
    expect(api.adjustAccessoryQuantity).toHaveBeenCalledWith('a1', -5, 'damaged', 'Water damage', expect.any(String))
  })

  it('switching to Add offers only the reasons that make sense', async () => {
    const user = userEvent.setup()
    showPage('/inventory/accessories/a1')
    await user.click(await screen.findByRole('button', { name: 'Adjust stock' }))
    await user.click(screen.getByLabelText('Add stock'))
    expect(within(screen.getByLabelText('Reason')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Found again', 'Stock count correction'])
  })

  it('does not submit twice while a request is in flight', async () => {
    let resolve!: (v: { adjustment_id: string; balance_after: number; replayed: boolean }) => void
    vi.mocked(api.adjustAccessoryQuantity).mockReturnValue(new Promise((r) => (resolve = r)))
    const user = userEvent.setup()
    showPage('/inventory/accessories/a1')
    await user.click(await screen.findByRole('button', { name: 'Adjust stock' }))
    await user.type(screen.getByLabelText('Quantity'), '1')
    await user.selectOptions(screen.getByLabelText('Reason'), 'lost')
    await user.type(screen.getByLabelText('Notes'), 'One gone')
    const button = screen.getByRole('button', { name: 'Record adjustment' })
    await user.click(button)
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(api.adjustAccessoryQuantity).toHaveBeenCalledTimes(1)
    resolve({ adjustment_id: 'x', balance_after: 19, replayed: false })
    expect(await screen.findByText(/Confirmed by the server/)).toBeInTheDocument()
  })
})
