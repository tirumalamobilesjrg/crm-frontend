import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = [string, unknown[]]
const calls: Call[] = []
let queue: Array<{ data: unknown; error: unknown; count?: number | null }> = []
let fallback: { data: unknown; error: unknown; count?: number | null } = { data: [], error: null, count: 0 }
const builder: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(queue.length > 0 ? queue.shift() : fallback).then(resolve)
      return (...args: unknown[]) => {
        calls.push([prop, args])
        return builder
      }
    },
  },
)
vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => (calls.push(['from', [t]]), builder), rpc: () => builder } }))

import { createExpense, deleteExpense, listExpenseAmounts, listExpenseCategories, listExpenses, updateExpense } from './expenses'
import { deleteCustomer, getCustomer, listCustomerInvoices, listCustomers, updateCustomer } from './customers'
import { loadInvoices, loadSoldLines, loadStockAccessories, loadStockDevices } from './reports'
import { listAudit } from './audit'
import { fetchAll, NO_ROWS_MESSAGE, TOO_MANY_MESSAGE } from './db'
import { PAGE_SIZE } from './inventory'

const named = (name: string) => calls.filter(([n]) => n === name).map(([, a]) => a)
const only = (name: string) => named(name)[0]

beforeEach(() => {
  calls.length = 0
  queue = []
  fallback = { data: [], error: null, count: 0 }
})

describe('fetchAll', () => {
  it('reads every page until a short page, in 1000-row steps', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ i }))
    queue = [{ data: full, error: null }, { data: full, error: null }, { data: [{ i: 1 }], error: null }]
    const rows = await fetchAll<{ i: number }>(() => Promise.resolve(queue.shift() as never))
    expect(rows).toHaveLength(2001)
  })
  it('passes the right ranges', async () => {
    const ranges: Array<[number, number]> = []
    queue = [{ data: Array.from({ length: 1000 }, () => ({})), error: null }, { data: [], error: null }]
    await fetchAll((from, to) => { ranges.push([from, to]); return Promise.resolve(queue.shift() as never) })
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
  })
  it('refuses to silently truncate past the cap', async () => {
    fallback = { data: Array.from({ length: 1000 }, () => ({})), error: null }
    await expect(fetchAll(() => Promise.resolve(fallback as never), 1000, 3000)).rejects.toThrow(TOO_MANY_MESSAGE)
  })
  it('surfaces a translated error', async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: { code: '42501', message: 'denied' } }))).rejects.toThrow(/permission/i)
  })
})

describe('customers', () => {
  it('pages, orders, and searches name, phone and email', async () => {
    fallback = { data: [{ id: 'c1' }], error: null, count: 60 }
    expect(await listCustomers({ page: 3, term: 'ravi' })).toEqual({ rows: [{ id: 'c1' }], total: 60 })
    expect(only('or')).toEqual(['name.ilike.*ravi*,phone.ilike.*ravi*,email.ilike.*ravi*'])
    expect(only('range')).toEqual([2 * PAGE_SIZE, 3 * PAGE_SIZE - 1])
    expect(named('order')).toEqual([['name'], ['id']])
  })
  it('no search adds no filter', async () => {
    await listCustomers({ page: 1, term: '' })
    expect(named('or')).toHaveLength(0)
  })
  it('reads one customer and their invoices by customer id', async () => {
    fallback = { data: { id: 'c1' }, error: null }
    await getCustomer('c1')
    expect(named('eq')).toContainEqual(['id', 'c1'])
    calls.length = 0
    fallback = { data: [], error: null }
    await listCustomerInvoices('c1')
    expect(named('from')).toEqual([['invoices']])
    expect(named('eq')).toContainEqual(['customer_id', 'c1'])
  })
  it('updates and deletes ask for the changed row; zero rows is an explicit failure', async () => {
    fallback = { data: [{ id: 'c1' }], error: null }
    await updateCustomer('c1', { name: 'R', phone: null, email: null, address: null })
    expect(only('select')).toEqual(['id'])
    calls.length = 0
    fallback = { data: [], error: null }
    await expect(deleteCustomer('c1')).rejects.toThrow(NO_ROWS_MESSAGE)
    await expect(updateCustomer('c1', { name: 'R', phone: null, email: null, address: null })).rejects.toThrow(NO_ROWS_MESSAGE)
  })
  it('deleting a customer who has sales gives the in-use message', async () => {
    fallback = { data: null, error: { code: '23503', message: 'violates foreign key constraint' } }
    await expect(deleteCustomer('c1')).rejects.toThrow(/still in use/)
  })
})

describe('expenses', () => {
  it('lists with date and category filters, newest first, paged', async () => {
    fallback = { data: [{ id: 'e1' }], error: null, count: 40 }
    const r = await listExpenses({ from: '2026-10-01', to: '2026-10-31', category: 'Rent', page: 2 })
    expect(r.total).toBe(40)
    expect(only('gte')).toEqual(['expense_date', '2026-10-01'])
    expect(only('lte')).toEqual(['expense_date', '2026-10-31'])
    expect(only('eq')).toEqual(['category', 'Rent'])
    expect(only('range')).toEqual([PAGE_SIZE, 2 * PAGE_SIZE - 1])
    expect(named('order')[0]).toEqual(['expense_date', { ascending: false }])
  })
  it('totals read every page with the same filters', async () => {
    queue = [{ data: Array.from({ length: 1000 }, () => ({ amount: 1, category: 'A' })), error: null }, { data: [{ amount: 2, category: 'B' }], error: null }]
    const rows = await listExpenseAmounts({ from: '2026-10-01', to: '', category: '' })
    expect(rows).toHaveLength(1001)
    expect(named('gte')).toHaveLength(2)
    expect(named('lte')).toHaveLength(0)
  })
  it('distinct categories', async () => {
    fallback = { data: [{ category: 'Rent' }, { category: 'Rent' }, { category: 'Tea' }], error: null }
    expect(await listExpenseCategories()).toEqual(['Rent', 'Tea'])
  })
  it('creates, updates (checked) and deletes (checked)', async () => {
    fallback = { data: { id: 'e1' }, error: null }
    await createExpense({ expense_date: '2026-10-18', category: 'Rent', description: null, amount: 1, paid_via: 'cash' })
    expect(only('insert')).toEqual([{ expense_date: '2026-10-18', category: 'Rent', description: null, amount: 1, paid_via: 'cash' }])
    fallback = { data: [], error: null }
    await expect(updateExpense('e1', { expense_date: '2026-10-18', category: 'Rent', description: null, amount: 1, paid_via: 'cash' })).rejects.toThrow(NO_ROWS_MESSAGE)
    await expect(deleteExpense('e1')).rejects.toThrow(NO_ROWS_MESSAGE) // what a Manager gets: RLS hides the row from DELETE
  })
})

describe('reports', () => {
  it('invoices in the instant range, oldest first, with payment method', async () => {
    await loadInvoices('2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z')
    expect(only('gte')).toEqual(['issued_at', '2026-10-01T00:00:00.000Z'])
    expect(only('lte')).toEqual(['issued_at', '2026-10-31T23:59:59.999Z'])
    expect(String(only('select')?.[0])).toContain('payments(method)')
  })
  it('sold lines filter on the embedded sale date and embed the device cost', async () => {
    await loadSoldLines('a', 'b')
    expect(only('gte')).toEqual(['sale.sold_at', 'a'])
    expect(only('lte')).toEqual(['sale.sold_at', 'b'])
    const sel = String(only('select')?.[0])
    expect(sel).toContain('sale:sales!inner(sold_at)')
    expect(sel).toContain('inventory_item_costs(cost_price)')
  })
  it('stock value reads in-stock devices and quantity variants', async () => {
    await loadStockDevices()
    expect(only('eq')).toEqual(['status', 'in_stock'])
    calls.length = 0
    await loadStockAccessories()
    expect(only('eq')).toEqual(['tracking_mode', 'quantity'])
  })
})

describe('audit', () => {
  it('lists newest first with optional action and table filters', async () => {
    fallback = { data: [{ id: 1 }], error: null, count: 5 }
    expect(await listAudit({ page: 1, action: 'sale', table: 'sales' })).toEqual({ rows: [{ id: 1 }], total: 5 })
    expect(named('ilike')).toEqual([['action', '*sale*'], ['table_name', '*sales*']])
    expect(only('order')).toEqual(['id', { ascending: false }])
  })
  it('only reads: nothing here can write', async () => {
    await listAudit({ page: 1, action: '', table: '' })
    for (const n of ['insert', 'update', 'delete', 'upsert']) expect(named(n)).toHaveLength(0)
  })
})
