import { describe, expect, it } from 'vitest'
import type { VariantLabelInfo } from '../../lib/types'
import {
  deviceReasonOptions, matchVariantIds, pageCount, quantityReasonOptions, sanitizeSearch, validateCorrection, validateQuantityAdjustment,
  validateStatusAdjustment, variantTitle,
} from './logic'

const A = '490154203237518'
const B = '356938035643809'

const index: VariantLabelInfo[] = [
  { id: 'v1', sku: 'NOVA-X1-8-128', color: 'Black', ram_gb: 8, storage_gb: 128, product: { name: 'X1', brand: { name: 'Nova' } } },
  { id: 'v2', sku: 'ZED-Z2', color: 'Blue', ram_gb: 4, storage_gb: 64, product: { name: 'Z2', brand: { name: 'Zed' } } },
]

describe('sanitizeSearch', () => {
  it('keeps letters, digits, space, dot and dash only (filter-injection safe)', () => {
    expect(sanitizeSearch('  nova,  x1)  ')).toBe('nova x1')
    expect(sanitizeSearch('a,b)c(d*e%f"g')).toBe('a b c d e f g')
    expect(sanitizeSearch('x),or(id.not.is.null')).toBe('x or id.not.is.null')
    expect(sanitizeSearch('1'.repeat(80))).toHaveLength(40)
  })
})

describe('matchVariantIds', () => {
  it('matches every word against brand, product, colour, RAM/storage and SKU', () => {
    expect(matchVariantIds(index, 'nova')).toEqual(['v1'])
    expect(matchVariantIds(index, 'nova black 128gb')).toEqual(['v1'])
    expect(matchVariantIds(index, 'z2')).toEqual(['v2'])
    expect(matchVariantIds(index, 'zed x1')).toEqual([])
    expect(matchVariantIds(index, '')).toEqual([])
  })
})

describe('variantTitle / pageCount', () => {
  it('names a variant and handles missing data', () => {
    expect(variantTitle(index[0])).toBe('Nova X1 Black 8GB RAM 128GB')
    expect(variantTitle(null)).toBe('—')
  })
  it('never reports fewer than one page', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(25)).toBe(1)
    expect(pageCount(26)).toBe(2)
  })
})

describe('deviceReasonOptions (mirrors the database transition rules)', () => {
  it.each([
    ['in_stock', ['damaged', 'lost', 'returned_to_supplier']],
    ['damaged', ['repaired', 'returned_to_supplier']],
    ['lost', ['found']],
    ['sold', []],
    ['returned_to_supplier', []],
  ] as const)('%s -> %j', (status, expected) => expect(deviceReasonOptions(status)).toEqual(expected))
})

describe('validateStatusAdjustment', () => {
  it('needs an allowed reason and notes of at least 3 characters', () => {
    expect(validateStatusAdjustment({ reason: '', notes: ' ' }, 'in_stock')).toEqual({ reason: expect.any(String), notes: expect.any(String) })
    expect(validateStatusAdjustment({ reason: 'found', notes: 'abc' }, 'in_stock').reason).toBeDefined() // 'found' is not allowed from in_stock
    expect(validateStatusAdjustment({ reason: 'damaged', notes: 'abc' }, 'in_stock')).toEqual({})
  })
})

describe('validateQuantityAdjustment', () => {
  const base = { direction: 'remove' as const, quantity: '5', reason: 'damaged' as const, notes: 'water damage' }
  it('turns a removal into a negative delta and an addition into a positive one', () => {
    expect(validateQuantityAdjustment(base, 20).value).toEqual({ delta: -5, reason: 'damaged', notes: 'water damage' })
    expect(validateQuantityAdjustment({ ...base, direction: 'add', reason: 'found' }, 20).value).toMatchObject({ delta: 5 })
  })
  it('rejects quantities that are not whole numbers from 1 to 100,000', () => {
    for (const q of ['', '0', '-3', '1.5', 'abc', '100001']) expect(validateQuantityAdjustment({ ...base, quantity: q }, 200000).errors.quantity).toBeDefined()
  })
  it('refuses to remove more than is on hand', () => {
    expect(validateQuantityAdjustment({ ...base, quantity: '21' }, 20).errors.quantity).toMatch(/Only 20/)
    expect(validateQuantityAdjustment({ ...base, quantity: '20' }, 20).errors.quantity).toBeUndefined()
  })
  it('only accepts reasons that match the direction', () => {
    expect(quantityReasonOptions('remove')).not.toContain('found')
    expect(quantityReasonOptions('add')).not.toContain('damaged')
    expect(validateQuantityAdjustment({ ...base, direction: 'add' }, 20).errors.reason).toBeDefined() // 'damaged' while adding
    expect(validateQuantityAdjustment({ ...base, notes: 'x' }, 20).errors.notes).toBeDefined()
  })
})

describe('validateCorrection', () => {
  const current = { imei1: A, imei2: null, serial_number: null }
  const form = { imei1: A, imei2: '', serial: '', reason: 'Typed the wrong digits' }
  it('sends only the fields that changed', () => {
    const r = validateCorrection(current, { ...form, imei1: B })
    expect(r.errors).toEqual({})
    expect(r.changes).toEqual({ imei1: B })
  })
  it('a blank field clears that identifier (null)', () => {
    const r = validateCorrection({ imei1: A, imei2: B, serial_number: null }, { ...form, imei2: '' })
    expect(r.changes).toEqual({ imei2: null })
  })
  it('upper-cases a serial number', () => {
    expect(validateCorrection(current, { ...form, serial: 'ab-1234' }).changes).toEqual({ serial_number: 'AB-1234' })
  })
  it('rejects bad IMEIs, bad serials and short reasons', () => {
    expect(validateCorrection(current, { ...form, imei1: '123' }).errors.imei1).toMatch(/15 digits/)
    expect(validateCorrection(current, { ...form, imei1: '490154203237519' }).errors.imei1).toMatch(/check digit/)
    expect(validateCorrection(current, { ...form, serial: 'a b' }).errors.serial).toBeDefined()
    expect(validateCorrection(current, { ...form, imei1: B, reason: 'short' }).errors.reason).toBeDefined()
  })
  it('keeps the database rules: needs an identifier, IMEI 2 needs IMEI 1 and must differ', () => {
    expect(validateCorrection(current, { ...form, imei1: '' }).errors.imei1).toMatch(/IMEI 1 or a serial/)
    expect(validateCorrection({ imei1: null, imei2: null, serial_number: 'SN-1234' }, { ...form, imei1: '', serial: 'SN-1234', imei2: B }).errors.imei2).toMatch(/needs an IMEI 1/)
    expect(validateCorrection(current, { ...form, imei2: A }).errors.imei2).toMatch(/differ/)
  })
  it('says so when nothing changed', () => {
    expect(validateCorrection(current, form).errors.imei1).toBe('Nothing has changed.')
    expect(validateCorrection(current, form).changes).toBeNull()
  })
})
