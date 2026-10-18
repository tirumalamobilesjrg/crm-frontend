import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake Supabase query builder: every chained call returns the same thenable, and awaiting it yields `result`.
// It records the chain so tests can assert that each write asks for the changed rows back with .select(<key>).
const calls: Array<[string, unknown[]]> = []
let result: { data: unknown; error: unknown } = { data: [], error: null }
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
vi.mock('../lib/supabase', () => ({ supabase: { from: (table: string) => (calls.push(['from', [table]]), builder), rpc: () => builder } }))

import { NO_ROWS_MESSAGE, runChange } from './db'
import { cancelPurchase, removePurchaseLine, setSupplierActive } from './purchasing'
import { savePolicy, updateStaff } from './settings'
import { setBrandActive, setCategoryActive, setPublished, updateProduct, updateVariant } from './catalogue'
import { AppError } from '../lib/errors'

beforeEach(() => {
  calls.length = 0
  result = { data: [], error: null }
})

const selected = () => calls.find(([name]) => name === 'select')?.[1]

describe('runChange', () => {
  it('resolves when at least one row was changed', async () => {
    await expect(runChange(Promise.resolve({ data: [{ id: '1' }], error: null }))).resolves.toBeUndefined()
  })
  it.each([[[]], [null]])('fails with a safe, non-specific error when %j rows were changed', async (data) => {
    const err = await runChange(Promise.resolve({ data: data as unknown[], error: null })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('no_rows')
    expect((err as AppError).message).toBe(NO_ROWS_MESSAGE)
    expect((err as AppError).message).not.toMatch(/permission|not authori[sz]ed|denied/i)
  })
  it('still surfaces real database errors', async () => {
    await expect(runChange(Promise.resolve({ data: null, error: { code: 'TM007', message: 'purchase is already received' } }))).rejects.toThrow(/already been received/)
  })
})

describe.each([
  ['cancelPurchase', () => cancelPurchase('p1'), 'id'],
  ['removePurchaseLine', () => removePurchaseLine('l1'), 'id'],
  ['setSupplierActive', () => setSupplierActive('s1', false), 'id'],
  ['savePolicy', () => savePolicy({ role: 'manager', can_discount: true, max_percent: 5, max_amount: null, can_approve: false }), 'role'],
  ['updateStaff', () => updateStaff('u1', { is_active: false }), 'user_id'],
  ['setBrandActive', () => setBrandActive('b1', false), 'id'],
  ['setCategoryActive', () => setCategoryActive('c1', false), 'id'],
  ['updateProduct', () => updateProduct('p1', { name: 'x' }), 'id'],
  ['setPublished', () => setPublished('p1', true), 'id'],
  ['updateVariant', () => updateVariant('v1', { color: null, ram_gb: null, storage_gb: null, mrp: 1, selling_price: 1, public_price: null, is_active: true }), 'id'],
])('%s', (_name, call, keyColumn) => {
  it('fails explicitly when the server changed zero rows (RLS-filtered, finalised or missing)', async () => {
    result = { data: [], error: null }
    await expect(call()).rejects.toMatchObject({ code: 'no_rows', message: NO_ROWS_MESSAGE })
  })
  it('asks the server for the changed rows by key column', async () => {
    result = { data: [{ [keyColumn]: 'x' }], error: null }
    await expect(call()).resolves.toBeUndefined()
    expect(selected()).toEqual([keyColumn])
  })
  it('passes a database error through its friendly translation', async () => {
    result = { data: null, error: { code: '42501', message: 'permission denied for table x' } }
    await expect(call()).rejects.toThrow(/permission/i)
  })
})
