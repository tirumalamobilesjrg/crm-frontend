import { describe, expect, it } from 'vitest'
import { MAX_SIDE, prepareForUpload, targetSize } from './resize'
import { MAX_INPUT_BYTES, validateChosen } from './media'

describe('targetSize', () => {
  it('shrinks the longest side to 1600 px and keeps the proportions', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(targetSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
  })
  it('never enlarges a small photo', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(targetSize(MAX_SIDE, 10)).toEqual({ width: MAX_SIDE, height: 10 })
  })
  it('never produces a zero side', () => expect(targetSize(100000, 1)).toEqual({ width: 1600, height: 1 }))
})

describe('prepareForUpload', () => {
  it('returns the original file when the browser cannot decode it (no error, the normal size check then applies)', async () => {
    const file = new File([new Uint8Array(100)], 'x.png', { type: 'image/png' })
    expect(await prepareForUpload(file)).toBe(file)
  })
})

describe('validateChosen (the photo as picked, before shrinking)', () => {
  it('allows a camera photo up to 15 MB and says why otherwise', () => {
    expect(validateChosen({ type: 'image/jpeg', size: 8 * 1024 * 1024 })).toBeNull()
    expect(validateChosen({ type: 'image/jpeg', size: MAX_INPUT_BYTES + 1 })).toMatch(/larger than 15 MB/)
    expect(validateChosen({ type: 'image/gif', size: 10 })).toMatch(/JPEG, PNG or WebP/)
    expect(validateChosen({ type: 'image/png', size: 0 })).toMatch(/empty/)
    expect(validateChosen(null)).toMatch(/Choose a photo/)
  })
})
