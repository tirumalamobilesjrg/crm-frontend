import { describe, expect, it } from 'vitest'

import { productSlug } from './slug'
describe('productSlug', () => {
  it('does not repeat the brand when the model already starts with it', () => {
    expect(productSlug('Nova', 'Nova X1')).toBe('nova-x1')
    expect(productSlug('Samsung', 'Galaxy S24')).toBe('samsung-galaxy-s24')
    expect(productSlug('', 'Galaxy S24')).toBe('galaxy-s24')
    expect(productSlug('Nova', 'Novatek 5')).toBe('nova-novatek-5')
  })
})
