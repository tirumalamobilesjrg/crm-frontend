import { describe, expect, it } from 'vitest'
import { validateLine, validatePurchase, validateSupplier, variantLabel } from './validation'

describe('validateSupplier', () => {
  it('needs a name and a plausible email if given', () => {
    expect(Object.keys(validateSupplier({ name: ' ', phone: '', email: 'nope', address: '', notes: '' })).sort()).toEqual(['email', 'name'])
    expect(validateSupplier({ name: 'Metro Traders', phone: '', email: '', address: '', notes: '' })).toEqual({})
  })
})

describe('validatePurchase', () => {
  it('needs supplier, invoice number and date', () => {
    expect(Object.keys(validatePurchase({ supplier_id: '', invoiceNo: ' ', invoiceDate: '', notes: '' })).sort()).toEqual(['invoiceDate', 'invoiceNo', 'supplier_id'])
    expect(validatePurchase({ supplier_id: 's', invoiceNo: 'INV-1', invoiceDate: '2026-10-18', notes: '' })).toEqual({})
  })
})

describe('validateLine', () => {
  it('parses a valid line', () => {
    expect(validateLine({ variant_id: 'v', quantity: '3', unitCost: '1,250.50' }).value).toEqual({ variant_id: 'v', quantity: 3, unit_cost: 1250.5 })
  })
  it('rejects bad quantity and cost', () => {
    const { errors, value } = validateLine({ variant_id: '', quantity: '501', unitCost: '0' })
    expect(value).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['quantity', 'unitCost', 'variant_id'])
    expect(validateLine({ variant_id: 'v', quantity: '1.5', unitCost: '10' }).errors.quantity).toBeDefined()
  })
})

describe('variantLabel', () => {
  it('describes a variant', () => {
    expect(variantLabel({ sku: 'NX1', color: 'Black', ram_gb: 8, storage_gb: 128, product: { name: 'Nova X1' } })).toBe('Nova X1 Black 8GB RAM 128GB (NX1)')
  })
})
