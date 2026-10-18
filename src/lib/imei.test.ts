import { describe, expect, it } from 'vitest'
import { checkIdentifier, luhnValid } from './imei'

describe('luhnValid', () => {
  it('accepts well-known valid IMEIs and rejects a changed digit', () => {
    expect(luhnValid('490154203237518')).toBe(true)
    expect(luhnValid('356938035643809')).toBe(true)
    expect(luhnValid('490154203237519')).toBe(false)
  })
})

describe('checkIdentifier', () => {
  it('treats a valid 15-digit value as an IMEI', () => {
    expect(checkIdentifier(' 490154203237518 ')).toEqual({ ok: true, id: { kind: 'imei', value: '490154203237518' } })
  })
  it('flags a wrong check digit', () => {
    expect(checkIdentifier('490154203237519')).toMatchObject({ ok: false, error: expect.stringMatching(/check digit/) })
  })
  it('flags digit-only values of the wrong length as a mistyped IMEI', () => {
    expect(checkIdentifier('49015420323751')).toMatchObject({ ok: false, error: expect.stringMatching(/15 digits/) })
  })
  it('accepts a serial number and upper-cases it', () => {
    expect(checkIdentifier('r5cn-12ab34')).toEqual({ ok: true, id: { kind: 'serial', value: 'R5CN-12AB34' } })
  })
  it('rejects empty and malformed serials', () => {
    expect(checkIdentifier('  ').ok).toBe(false)
    expect(checkIdentifier('ab').ok).toBe(false)
    expect(checkIdentifier('AB CD 12').ok).toBe(false)
  })
})
