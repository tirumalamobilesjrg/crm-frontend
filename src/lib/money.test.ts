import { describe, expect, it } from 'vitest'
import { formatINR, parseRupees, toPaise } from './money'
import { slugify } from './slug'

describe('money', () => {
  it('parses rupee input', () => {
    expect(parseRupees('70,000')).toBe(70000)
    expect(parseRupees(' ₹ 799.5 ')).toBe(799.5)
    expect(parseRupees('0.05')).toBe(0.05)
  })
  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1,2,3.', '12e3', '.5']) expect(parseRupees(bad)).toBeNull()
    // a decimal comma must not be read as thousands ("250,00" would have become 25,000)
    for (const bad of ['250,00', '799,50', '1,00', '12,3456', ',500']) expect(parseRupees(bad)).toBeNull()
    for (const [typed, value] of [['1,000', 1000], ['1,00,000', 100000], ['12,34,567.50', 1234567.5], ['100,000', 100000]] as const) expect(parseRupees(typed)).toBe(value)
  })
  it('compares exactly in paise', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30)
    expect(toPaise(799.99)).toBe(79999)
  })
  it('formats rupees and missing values', () => {
    expect(formatINR(70000)).toContain('70,000')
    expect(formatINR(null)).toBe('—')
  })
})

describe('slugify', () => {
  it('makes url-safe slugs', () => {
    expect(slugify('Samsung Galaxy S24 Ultra!')).toBe('samsung-galaxy-s24-ultra')
    expect(slugify('  --Café  Phone-- ')).toBe('cafe-phone')
    expect(slugify('***')).toBe('')
  })
})
