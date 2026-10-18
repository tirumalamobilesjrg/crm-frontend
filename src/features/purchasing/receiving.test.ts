import { describe, expect, it } from 'vitest'
import type { PurchaseLine } from '../../lib/types'
import { analyseUnits, buildSlots } from './receiving'

const line = (id: string, quantity: number, mode: 'serialized' | 'quantity'): PurchaseLine => ({
  id, purchase_id: 'p', variant_id: `v-${id}`, quantity, unit_cost: 100, line_total: quantity * 100,
  variant: { sku: id.toUpperCase(), color: null, ram_gb: null, storage_gb: null, tracking_mode: mode, product: { name: 'X' } },
})

const A = '490154203237518'
const B = '356938035643809'

describe('buildSlots', () => {
  it('makes one slot per phone and none for accessories', () => {
    const slots = buildSlots([line('a', 2, 'serialized'), line('b', 40, 'quantity'), line('c', 1, 'serialized')])
    expect(slots.map((s) => s.key)).toEqual(['a:1', 'a:2', 'c:1'])
  })
})

describe('analyseUnits', () => {
  const slots = buildSlots([line('a', 2, 'serialized')])

  it('is ready and builds the payload when every box is a valid, unique identifier', () => {
    const r = analyseUnits(slots, { 'a:1': A, 'a:2': 'sn-1234' })
    expect(r.ready).toBe(true)
    expect(r.units).toEqual([
      { purchase_item_id: 'a', imei1: A },
      { purchase_item_id: 'a', serial_number: 'SN-1234' },
    ])
  })
  it('is not ready while a box is empty, without raising an error on it yet', () => {
    const r = analyseUnits(slots, { 'a:1': A })
    expect(r.ready).toBe(false)
    expect(r.filledCount).toBe(1)
    expect(r.statuses['a:2']).toEqual({ filled: false, error: null })
  })
  it('flags a bad IMEI', () => {
    const r = analyseUnits(slots, { 'a:1': '490154203237519', 'a:2': B })
    expect(r.ready).toBe(false)
    expect(r.statuses['a:1']?.error).toMatch(/check digit/)
  })
  it('flags both boxes of a duplicate, even across different lines and letter case', () => {
    const two = buildSlots([line('a', 1, 'serialized'), line('b', 1, 'serialized')])
    const r = analyseUnits(two, { 'a:1': 'abcd-99', 'b:1': 'ABCD-99' })
    expect(r.ready).toBe(false)
    expect(r.statuses['a:1']?.error).toMatch(/Duplicate/)
    expect(r.statuses['b:1']?.error).toMatch(/Duplicate/)
  })
  it('is ready with no phone boxes at all (accessory-only purchase)', () => {
    expect(analyseUnits([], {})).toMatchObject({ ready: true, units: [] })
  })
})
