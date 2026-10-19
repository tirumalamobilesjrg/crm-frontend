import { describe, expect, it } from 'vitest'
import { categoryImagePath, MAX_CATEGORY_IMAGE_BYTES, MAX_CATEGORY_INPUT_BYTES, validateCategoryChosen, validateCategoryImage } from './categoryImage'

describe('category picture rules (mirror migration 0027)', () => {
  it.each([
    ['image/jpeg', 1000, null],
    ['image/png', MAX_CATEGORY_INPUT_BYTES, null],
    ['image/webp', 1, null],
    ['image/gif', 1000, /JPEG, PNG or WebP/],
    ['image/svg+xml', 1000, /JPEG, PNG or WebP/],
    ['image/png', 0, /empty/],
    ['image/png', MAX_CATEGORY_INPUT_BYTES + 1, /larger than 15 MB/],
  ])('as picked: %s of %i bytes', (type, size, expected) => {
    const problem = validateCategoryChosen({ type, size })
    if (expected === null) expect(problem).toBeNull()
    else expect(problem).toMatch(expected)
  })
  it('asks for a picture when none is chosen', () => expect(validateCategoryChosen(null)).toMatch(/Choose a picture/))
  it('as stored: at most 1 MB after shrinking', () => {
    expect(validateCategoryImage({ type: 'image/webp', size: MAX_CATEGORY_IMAGE_BYTES })).toBeNull()
    expect(validateCategoryImage({ type: 'image/webp', size: MAX_CATEGORY_IMAGE_BYTES + 1 })).toMatch(/still larger than 1 MB/)
    expect(validateCategoryImage({ type: 'image/gif', size: 10 })).toMatch(/JPEG, PNG or WebP/)
  })
  it('names the object categories/<slug>/<random>.<ext>', () => {
    expect(categoryImagePath('phones', 'image/webp', 'abc')).toBe('categories/phones/abc.webp')
    expect(categoryImagePath('phones', 'image/jpeg', 'r')).toBe('categories/phones/r.jpg')
    expect(categoryImagePath('phones', 'image/png', 'r')).toBe('categories/phones/r.png')
  })
})
