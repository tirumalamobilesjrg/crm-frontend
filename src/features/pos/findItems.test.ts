import { describe, expect, it } from 'vitest'
import { findItems } from './findItems'
import type { CartLine } from './logic'
import type { SellableAccessory, SellableDevice } from '../../lib/types'

const variant = (sku: string, name: string, brand: string, color: string, storage: number, selling = 19000) => ({
  id: `v-${sku}`, sku, color, ram_gb: 8, storage_gb: storage, mrp: 20000, selling_price: selling, is_active: true, product: { name, brand: { name: brand } },
})
const device = (id: string, imei: string, v = variant('NOVA-X1-8-128', 'X1', 'Nova', 'Black', 128), status: SellableDevice['status'] = 'in_stock'): SellableDevice => ({
  id, variant_id: v.id, imei1: imei, imei2: null, serial_number: null, status, variant: v,
})
const acc = (id: string, name: string, onHand = 5): SellableAccessory => ({ id, sku: `SKU-${id}`, color: 'Black', mrp: 500, selling_price: 400, is_active: true, product: { name, brand: { name: 'Nova' } }, on_hand: onHand })

const devices = [
  device('d1', '352000000000018'),
  device('d2', '352000000000026'),
  device('d3', '352000000000034', variant('NOVA-X1-8-256', 'X1', 'Nova', 'Blue', 256, 22000)),
  device('d4', '352000000000042', variant('SAM-A15', 'Galaxy A15', 'Samsung', 'Black', 128, 14000)),
  device('sold', '352000000000059', undefined, 'sold'),
]
const accessories = [acc('c1', 'Case'), acc('c2', 'Charger'), acc('c3', 'Cable', 0)]

describe('findItems', () => {
  it('finds phones by brand, model, colour and storage, ANDing the words', () => {
    expect(findItems(devices, accessories, 'nova x1', []).items.filter((i) => i.kind === 'device')).toHaveLength(3)
    expect(findItems(devices, accessories, 'nova 128 black', []).items.map((i) => i.key)).toEqual(['d:d1', 'd:d2'])
    expect(findItems(devices, accessories, 'galaxy', []).items.map((i) => i.key)).toEqual(['d:d4'])
    expect(findItems(devices, accessories, 'blue 256', []).items.map((i) => i.key)).toEqual(['d:d3'])
  })
  it('finds a phone from the last digits of its IMEI', () => {
    expect(findItems(devices, accessories, '0026', []).items.map((i) => i.key)).toEqual(['d:d2'])
    expect(findItems(devices, accessories, '0026', []).items[0]).toMatchObject({ detail: 'IMEI ending 0026' })
  })
  it('never offers sold phones or out-of-stock accessories', () => {
    expect(findItems(devices, accessories, '0059', []).total).toBe(0)
    expect(findItems(devices, accessories, 'cable', []).total).toBe(0)
  })
  it('finds accessories with their stock and price', () => {
    expect(findItems(devices, accessories, 'case', []).items).toMatchObject([{ kind: 'accessory', detail: '5 in stock', price: 400 }])
  })
  it('leaves out what is already in the cart', () => {
    const cart = [{ kind: 'device', itemId: 'd1' }, { kind: 'accessory', variantId: 'c1' }] as unknown as CartLine[]
    expect(findItems(devices, accessories, 'nova 128 black', cart).items.map((i) => i.key)).toEqual(['d:d2'])
    expect(findItems(devices, accessories, 'case', cart).total).toBe(0)
  })
  it('needs at least two characters, ignores case and extra spaces, and caps the list', () => {
    expect(findItems(devices, accessories, 'n', []).total).toBe(0)
    expect(findItems(devices, accessories, '   ', []).total).toBe(0)
    expect(findItems(devices, accessories, '  NOVA   X1 ', []).total).toBeGreaterThan(0)
    const many = Array.from({ length: 30 }, (_, i) => device(`m${i}`, `3520000000${String(i).padStart(5, '0')}`))
    const r = findItems(many, [], 'nova', [], 10)
    expect(r.items).toHaveLength(10)
    expect(r.total).toBe(30)
  })
})
