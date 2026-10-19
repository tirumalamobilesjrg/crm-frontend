import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = [string, unknown[]]
const calls: Call[] = []
let result: { data: unknown; error: unknown; count?: number | null } = { data: [], error: null }
const builder: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return (...args: unknown[]) => {
        calls.push([prop, args])
        return builder
      }
    },
  },
)
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t: string) => (calls.push(['from', [t]]), builder), rpc: (fn: string, args: unknown) => (calls.push(['rpc', [fn, args]]), builder) },
}))

import {
  createCustomer, finalizeSale, findDeviceByIdentifier, getInvoiceBySale, grantDiscountApproval, listApprovals, listSales, listSellableAccessories, listUsableApprovals, searchCustomers,
} from './sales'
import { PAGE_SIZE } from './inventory'

const named = (name: string) => calls.filter(([n]) => n === name).map(([, a]) => a)
const only = (name: string) => named(name)[0]

beforeEach(() => {
  calls.length = 0
  result = { data: [], error: null, count: 0 }
})

describe('lookups', () => {
  it('finds a device by exact IMEI 1, IMEI 2 or (upper-cased) serial, in any status', async () => {
    await findDeviceByIdentifier('ab-1234')
    expect(only('or')).toEqual(['imei1.eq.ab-1234,imei2.eq.ab-1234,serial_number.eq.AB-1234'])
    expect(only('limit')).toEqual([2])
    expect(named('eq')).toHaveLength(0) // no status filter: the screen explains why a device is not sellable
  })
  it('lists only active quantity SKUs that have stock', async () => {
    const row = (sku: string, stock: unknown) => ({ id: sku, sku, color: null, mrp: 500, selling_price: 400, is_active: true, product: { name: 'Case', brand: null }, stock })
    result = { data: [row('A', { on_hand: 5 }), row('B', [{ on_hand: 2 }]), row('C', null), row('D', { on_hand: 0 })], error: null }
    const rows = await listSellableAccessories()
    expect(rows.map((r) => [r.sku, r.on_hand])).toEqual([['A', 5], ['B', 2]])
    expect(named('eq')).toEqual([['tracking_mode', 'quantity'], ['is_active', true]])
  })
  it('searches customers by name or phone and creates them', async () => {
    await searchCustomers('ravi')
    expect(only('or')).toEqual(['name.ilike.*ravi*,phone.ilike.*ravi*'])
    calls.length = 0
    result = { data: { id: 'c1' }, error: null }
    await createCustomer({ name: 'R', phone: null, email: null, address: null })
    expect(only('insert')).toEqual([{ name: 'R', phone: null, email: null, address: null }])
  })
  it('a duplicate customer phone becomes a friendly message', async () => {
    result = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "customers_phone_key"', details: 'Key (phone)=(1) already exists.' } }
    await expect(createCustomer({ name: 'R', phone: '1', email: null, address: null })).rejects.toThrow(/customer with this phone number already exists/)
  })
  it('lists only my unused, unexpired approvals', async () => {
    await listUsableApprovals('u1')
    expect(named('eq')).toContainEqual(['requested_for', 'u1'])
    expect(named('is')).toContainEqual(['used_at', null])
    expect(named('gt')[0]?.[0]).toBe('expires_at')
  })
})

describe('finalizeSale (the only way a sale is created)', () => {
  it('calls finalize_sale with the documented argument names and one payment object', async () => {
    result = { data: { sale_id: 's1' }, error: null }
    await finalizeSale(
      { customerId: 'c1', items: [{ inventory_item_id: 'd1', unit_price: 19000, discount_amount: 0 }], payment: { method: 'upi', amount: 19000, reference: 'R1' }, notes: 'n', discountReason: 'why', approvalId: 'ap1' },
      'key-12345678',
    )
    expect(only('rpc')).toEqual([
      'finalize_sale',
      {
        p_idempotency_key: 'key-12345678', p_customer_id: 'c1', p_items: [{ inventory_item_id: 'd1', unit_price: 19000, discount_amount: 0 }],
        p_payment: { method: 'upi', amount: 19000, reference: 'R1' }, p_notes: 'n', p_discount_reason: 'why', p_discount_approval_id: 'ap1',
      },
    ])
  })
  it('sends a walk-in sale with null customer and no discount fields', async () => {
    result = { data: {}, error: null }
    await finalizeSale({ customerId: null, items: [], payment: { method: 'cash', amount: 1 }, notes: null, discountReason: null, approvalId: null }, 'key-12345678')
    expect((only('rpc')?.[1] as Record<string, unknown>).p_customer_id).toBeNull()
  })
  it('never inserts, updates or deletes anything itself', async () => {
    result = { data: {}, error: null }
    await finalizeSale({ customerId: null, items: [], payment: { method: 'cash', amount: 1 }, notes: null, discountReason: null, approvalId: null }, 'key-12345678')
    for (const n of ['insert', 'update', 'delete', 'upsert']) expect(named(n)).toHaveLength(0)
  })
  it.each([
    ['TM004', 'inventory item x is not available', /not available/],
    ['TM006', 'payment (1) must equal the sale total (2)', /payment amount must equal/],
    ['TM005', 'discount exceeds your limit', /discount is not allowed/],
  ])('translates %s', async (code, message, expected) => {
    result = { data: null, error: { code, message } }
    await expect(finalizeSale({ customerId: null, items: [], payment: { method: 'cash', amount: 1 }, notes: null, discountReason: null, approvalId: null }, 'key-12345678')).rejects.toThrow(expected)
  })
  it('shows the MRP rejection wording from the server (it names the SKU, not an internal id)', async () => {
    result = { data: null, error: { code: 'TM003', message: 'line 1: unit price 20000.01 is above the MRP 20000.00 for SKU NOVA-X1' } }
    await expect(finalizeSale({ customerId: null, items: [], payment: { method: 'cash', amount: 1 }, notes: null, discountReason: null, approvalId: null }, 'key-12345678')).rejects.toThrow(/above the MRP 20000.00 for SKU NOVA-X1/)
  })
})

describe('sales and invoices (read only)', () => {
  it('pages the list from the invoices table, newest first, with a text search', async () => {
    result = { data: [{ id: 'i1' }], error: null, count: 60 }
    const r = await listSales({ page: 2, term: 'ravi' })
    expect(r).toEqual({ rows: [{ id: 'i1' }], total: 60 })
    expect(only('or')).toEqual(['invoice_number.ilike.*ravi*,customer_name.ilike.*ravi*'])
    expect(only('range')).toEqual([PAGE_SIZE, 2 * PAGE_SIZE - 1])
    expect(named('order')[0]).toEqual(['issued_at', { ascending: false }])
  })
  it('reads one invoice by its sale with items, payments and sale details', async () => {
    result = { data: { id: 'i1' }, error: null }
    await getInvoiceBySale('s1')
    expect(named('eq')).toContainEqual(['sale_id', 's1'])
    const sel = String(only('select')?.[0])
    expect(sel).toContain('items:invoice_items(')
    expect(sel).toContain('payments(')
    expect(sel).toContain('sale:sales(')
  })
})

describe('Admin approvals', () => {
  it('grants through grant_discount_approval with documented arguments', async () => {
    result = { data: { approval_id: 'a' }, error: null }
    await grantDiscountApproval({ requestedFor: 'u1', maxAmount: 1500, reason: 'Festival', validMinutes: 15, inventoryItemId: 'item-1' }, 'key-12345678')
    expect(only('rpc')).toEqual(['grant_discount_approval', { p_idempotency_key: 'key-12345678', p_requested_for: 'u1', p_max_amount: 1500, p_reason: 'Festival', p_valid_minutes: 15, p_inventory_item_id: 'item-1', p_variant_id: null }])
  })
  it('an accessory approval sends the product, not an item', async () => {
    result = { data: { approval_id: 'a' }, error: null }
    await grantDiscountApproval({ requestedFor: 'u1', maxAmount: 400, reason: 'Two cases', validMinutes: 15, variantId: 'var-1' }, 'key-12345678')
    expect(only('rpc')).toEqual(['grant_discount_approval', { p_idempotency_key: 'key-12345678', p_requested_for: 'u1', p_max_amount: 400, p_reason: 'Two cases', p_valid_minutes: 15, p_inventory_item_id: null, p_variant_id: 'var-1' }])
  })
  it('a Manager is refused in plain words', async () => {
    result = { data: null, error: { code: '42501', message: 'only an Admin whose policy allows approvals may approve discounts' } }
    await expect(grantDiscountApproval({ requestedFor: 'u1', maxAmount: 1, reason: 'abc', validMinutes: 5 }, 'key-12345678')).rejects.toThrow(/permission/i)
  })
  it('lists recent approvals', async () => {
    await listApprovals()
    expect(named('from')).toEqual([['discount_approvals']])
  })
})
