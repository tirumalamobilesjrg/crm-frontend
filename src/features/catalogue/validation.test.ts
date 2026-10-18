import { describe, expect, it } from 'vitest'
import { validateProduct, validateVariant, type VariantForm } from './validation'

const good: VariantForm = { sku: 'nova-x1-8-128', color: ' Black ', ram: '8', storage: '128', mrp: '72,000', selling: '70000', publicPrice: '69999', trackingMode: 'serialized' }

describe('validateVariant', () => {
  it('parses a valid form and normalises the SKU', () => {
    const { errors, value } = validateVariant(good)
    expect(errors).toEqual({})
    expect(value).toMatchObject({ sku: 'NOVA-X1-8-128', color: 'Black', ram_gb: 8, storage_gb: 128, mrp: 72000, selling_price: 70000, public_price: 69999 })
  })
  it('treats an empty website price as none', () => {
    expect(validateVariant({ ...good, publicPrice: '' }).value?.public_price).toBeNull()
  })
  it('rejects a selling price above the MRP', () => {
    expect(validateVariant({ ...good, selling: '72000.01' }).errors.selling).toMatch(/MRP/)
  })
  it('rejects a website price above the MRP', () => {
    expect(validateVariant({ ...good, publicPrice: '80000' }).errors.publicPrice).toMatch(/MRP/)
  })
  it('rejects a bad SKU, bad numbers and sub-paisa prices', () => {
    const { errors, value } = validateVariant({ ...good, sku: 'a b', ram: '8GB', storage: '0', mrp: '10.001', selling: '' })
    expect(value).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['mrp', 'ram', 'selling', 'sku', 'storage'])
  })
  it('allows accessories without RAM or storage', () => {
    const { value } = validateVariant({ ...good, sku: 'CASE-BLK', ram: '', storage: '', trackingMode: 'quantity', publicPrice: '' })
    expect(value).toMatchObject({ ram_gb: null, storage_gb: null, tracking_mode: 'quantity' })
  })
})

describe('validateProduct', () => {
  it('requires name, brand and category', () => {
    expect(Object.keys(validateProduct({ name: ' ', brand_id: '', category_id: '', description: '' })).sort()).toEqual(['brand_id', 'category_id', 'name'])
    expect(validateProduct({ name: 'Nova X1', brand_id: 'b', category_id: 'c', description: '' })).toEqual({})
  })
})
