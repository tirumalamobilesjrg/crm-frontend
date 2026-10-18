import { describe, expect, it } from 'vitest'
import type { ProductImage, ProductSpec } from '../../lib/types'
import { groupSpecs, MAX_PHOTO_BYTES, photoPath, sortImages, validateAlt, validatePhoto, validateSpec } from './media'

describe('validatePhoto', () => {
  it('accepts JPEG, PNG and WebP up to 2 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(validatePhoto({ type, size: 1000 })).toBeNull()
    expect(validatePhoto({ type: 'image/png', size: MAX_PHOTO_BYTES })).toBeNull()
  })
  it('refuses other types, empty files, oversize files and no file', () => {
    expect(validatePhoto({ type: 'image/gif', size: 10 })).toBe('Use a JPEG, PNG or WebP photo.')
    expect(validatePhoto({ type: 'text/html', size: 10 })).toBe('Use a JPEG, PNG or WebP photo.')
    expect(validatePhoto({ type: 'application/pdf', size: 10 })).toBeDefined()
    expect(validatePhoto({ type: 'image/png', size: 0 })).toMatch(/empty/)
    expect(validatePhoto({ type: 'image/png', size: MAX_PHOTO_BYTES + 1 })).toMatch(/larger than 2 MB/)
    expect(validatePhoto(null)).toMatch(/Choose a photo/)
  })
})

describe('photoPath', () => {
  it('builds products/<id>/<random>.<ext> by content type', () => {
    expect(photoPath('p1', 'image/jpeg', 'abc')).toBe('products/p1/abc.jpg')
    expect(photoPath('p1', 'image/png', 'abc')).toBe('products/p1/abc.png')
    expect(photoPath('p1', 'image/webp', 'abc')).toBe('products/p1/abc.webp')
  })
  it('matches the pattern the backend enforces', () => {
    const id = '8f14e45f-ceea-467a-9575-4c5d7c8b1a3b'
    expect(photoPath(id, 'image/png', crypto.randomUUID())).toMatch(/^products\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/)
  })
})

describe('validateAlt / validateSpec', () => {
  it('limits the description length', () => {
    expect(validateAlt('x'.repeat(200))).toBeNull()
    expect(validateAlt('x'.repeat(201))).toMatch(/under 200/)
  })
  it('defaults the group, trims, and parses the order', () => {
    expect(validateSpec({ group: ' ', key: ' Screen size ', value: ' 6.5 inch ', order: '' }).value).toEqual({ group_name: 'General', spec_key: 'Screen size', spec_value: '6.5 inch', sort_order: 0 })
    expect(validateSpec({ group: 'Display', key: 'Size', value: 'x', order: '-3' }).value?.sort_order).toBe(-3)
  })
  it('needs a name and a value, and a numeric order', () => {
    const r = validateSpec({ group: 'x'.repeat(61), key: '', value: '', order: 'abc' })
    expect(r.value).toBeNull()
    expect(Object.keys(r.errors).sort()).toEqual(['group', 'key', 'order', 'value'])
    expect(validateSpec({ group: '', key: 'k'.repeat(61), value: 'v'.repeat(301), order: '1.5' }).errors).toMatchObject({ key: expect.any(String), value: expect.any(String), order: expect.any(String) })
  })
})

describe('groupSpecs / sortImages', () => {
  const spec = (group: string, key: string, order: number): ProductSpec => ({ id: group + key, product_id: 'p', group_name: group, spec_key: key, spec_value: 'v', sort_order: order })
  it('groups by name in order of the lowest sort order, rows by order then name', () => {
    const g = groupSpecs([spec('Battery', 'Capacity', 5), spec('Display', 'Size', 1), spec('Display', 'Refresh', 1), spec('Display', 'Type', 2)])
    expect(g.map((x) => [x.group, x.rows.map((r) => r.spec_key)])).toEqual([['Display', ['Refresh', 'Size', 'Type']], ['Battery', ['Capacity']]])
  })
  it('an empty list has no groups', () => {
    expect(groupSpecs([])).toEqual([])
  })
  it('orders photos by sort order then upload time', () => {
    const img = (id: string, order: number, at: string): ProductImage => ({ id, product_id: 'p', storage_path: id, alt_text: '', sort_order: order, is_primary: false, created_at: at })
    expect(sortImages([img('c', 1, '2026-01-03'), img('a', 0, '2026-01-02'), img('b', 0, '2026-01-01')]).map((i) => i.id)).toEqual(['b', 'a', 'c'])
  })
})
