import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake query builder: records every chained call; awaiting it yields `result`.
type Call = [string, unknown[]]
const calls: Call[] = []
let result: { data: unknown; error: unknown; count?: number | null } = { data: [], error: null }
const results: Array<{ data: unknown; error: unknown; count?: number | null }> = []
const builder: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(results.length > 0 ? results.shift() : result).then(resolve)
      return (...args: unknown[]) => {
        calls.push([prop, args])
        return builder
      }
    },
  },
)
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => (calls.push(['from', [t]]), builder),
    rpc: (fn: string, args: unknown) => (calls.push(['rpc', [fn, args]]), builder),
  },
}))

import {
  adjustAccessoryQuantity, adjustDeviceStatus, correctIdentifiers, getAccessory, getDevice, getDeviceCost, listAccessories, listAccessoryMovements,
  listDeviceCorrections, listDeviceMovements, listDevices, loadInventorySummary, PAGE_SIZE,
} from './inventory'

const named = (name: string) => calls.filter(([n]) => n === name).map(([, a]) => a)
const only = (name: string) => named(name)[0]

beforeEach(() => {
  calls.length = 0
  results.length = 0
  result = { data: [], error: null, count: 0 }
})

describe('listDevices', () => {
  it('pages with range() and orders deterministically', async () => {
    result = { data: [{ id: 'd1' }], error: null, count: 60 }
    const r = await listDevices({ page: 3, status: '', variantIds: [], identifierTerm: '' })
    expect(r).toEqual({ rows: [{ id: 'd1' }], total: 60 })
    expect(only('range')).toEqual([2 * PAGE_SIZE, 3 * PAGE_SIZE - 1])
    expect(named('order')).toEqual([['received_at', { ascending: false }], ['id']])
    expect(only('select')?.[1]).toEqual({ count: 'exact' })
  })
  it('filters by status', async () => {
    await listDevices({ page: 1, status: 'damaged', variantIds: [], identifierTerm: '' })
    expect(only('eq')).toEqual(['status', 'damaged'])
  })
  it('searches identifiers and matched variants in one OR filter', async () => {
    await listDevices({ page: 1, status: '', variantIds: ['v1', 'v2'], identifierTerm: '4901' })
    expect(only('or')).toEqual(['imei1.ilike.*4901*,imei2.ilike.*4901*,serial_number.ilike.*4901*,variant_id.in.(v1,v2)'])
  })
  it('adds no OR filter without a search', async () => {
    await listDevices({ page: 1, status: '', variantIds: [], identifierTerm: '' })
    expect(named('or')).toHaveLength(0)
  })
  it('throws a translated error', async () => {
    result = { data: null, error: { code: '42501', message: 'permission denied' } }
    await expect(listDevices({ page: 1, status: '', variantIds: [], identifierTerm: '' })).rejects.toThrow(/permission/i)
  })
})

describe('device reads', () => {
  it('reads one device, its cost, ledger and corrections by device id', async () => {
    result = { data: { id: 'd1' }, error: null }
    await getDevice('d1')
    expect(named('eq')).toContainEqual(['id', 'd1'])
    calls.length = 0
    await getDeviceCost('d1')
    expect(named('from')).toEqual([['inventory_item_costs']])
    expect(named('eq')).toContainEqual(['inventory_item_id', 'd1'])
    calls.length = 0
    await listDeviceMovements('d1')
    expect(named('from')).toEqual([['stock_movements']])
    expect(named('eq')).toContainEqual(['inventory_item_id', 'd1'])
    calls.length = 0
    await listDeviceCorrections('d1')
    expect(named('from')).toEqual([['inventory_identifier_corrections']])
  })
  it('an unreadable cost resolves to null instead of failing the page', async () => {
    result = { data: null, error: null }
    await expect(getDeviceCost('d1')).resolves.toBeNull()
  })
})

describe('accessories', () => {
  const raw = (stock: unknown) => ({ id: 'a1', sku: 'CASE', color: null, is_active: true, product: { name: 'Case', brand: { name: 'Nova' } }, stock })
  it('reads the balance whether the embed comes back as an object or an array, and treats a missing row as 0', async () => {
    result = { data: [raw({ on_hand: 7 }), raw([{ on_hand: 3 }]), raw(null), raw([])], error: null }
    const rows = await listAccessories()
    expect(rows.map((r) => r.on_hand)).toEqual([7, 3, 0, 0])
    expect(named('eq')).toContainEqual(['tracking_mode', 'quantity'])
  })
  it('reads one accessory and only its quantity movements', async () => {
    result = { data: raw({ on_hand: 5 }), error: null }
    expect((await getAccessory('a1')).on_hand).toBe(5)
    calls.length = 0
    result = { data: [], error: null }
    await listAccessoryMovements('a1')
    expect(named('eq')).toContainEqual(['variant_id', 'a1'])
    expect(named('is')).toContainEqual(['inventory_item_id', null])
  })
})

describe('loadInventorySummary', () => {
  it('combines status counts with accessory totals and flags a truncated unit total', async () => {
    // 5 status counts, accessory SKU count, then the on_hand rows (Promise.all calls them in this order)
    results.push(
      { data: null, error: null, count: 12 }, { data: null, error: null, count: 2 }, { data: null, error: null, count: 1 },
      { data: null, error: null, count: 0 }, { data: null, error: null, count: 40 }, { data: null, error: null, count: 3 },
      { data: [{ on_hand: 10 }, { on_hand: 5 }], error: null },
    )
    const s = await loadInventorySummary()
    expect(s).toEqual({ inStock: 12, damaged: 2, lost: 1, returnedToSupplier: 0, sold: 40, accessorySkusInStock: 3, accessoryUnits: 15, accessoryUnitsTruncated: true })
  })
})

describe('write paths are RPCs only, with the documented argument names', () => {
  beforeEach(() => {
    result = { data: { ok: true }, error: null }
  })
  it('adjust_stock', async () => {
    await adjustDeviceStatus('d1', 'damaged', 'dropped', 'key-12345678')
    expect(only('rpc')).toEqual(['adjust_stock', { p_idempotency_key: 'key-12345678', p_inventory_item_id: 'd1', p_reason: 'damaged', p_notes: 'dropped' }])
  })
  it('adjust_quantity_stock', async () => {
    await adjustAccessoryQuantity('v1', -5, 'lost', 'gone', 'key-12345678')
    expect(only('rpc')).toEqual(['adjust_quantity_stock', { p_idempotency_key: 'key-12345678', p_variant_id: 'v1', p_quantity_delta: -5, p_reason: 'lost', p_notes: 'gone' }])
  })
  it('correct_item_identifiers (null clears a value, omitted keys are untouched)', async () => {
    await correctIdentifiers('d1', { imei2: null }, 'removing a wrong second IMEI', 'key-12345678')
    expect(only('rpc')).toEqual(['correct_item_identifiers', { p_idempotency_key: 'key-12345678', p_inventory_item_id: 'd1', p_changes: { imei2: null }, p_reason: 'removing a wrong second IMEI' }])
  })
  it('never calls insert, update or delete on any table', async () => {
    await adjustDeviceStatus('d1', 'lost', 'gone missing', 'key-12345678')
    await adjustAccessoryQuantity('v1', 1, 'found', 'found one', 'key-12345678')
    await correctIdentifiers('d1', { imei1: 'x' }, 'fix a typo in the imei', 'key-12345678')
    expect(named('insert')).toHaveLength(0)
    expect(named('update')).toHaveLength(0)
    expect(named('delete')).toHaveLength(0)
  })
  it('translates a server rejection', async () => {
    result = { data: null, error: { code: 'TM013', message: 'SKU does not exist or is not quantity-tracked' } }
    await expect(adjustAccessoryQuantity('v1', 1, 'found', 'found one', 'key-12345678')).rejects.toThrow(/does not apply to this kind of product/)
  })
})
