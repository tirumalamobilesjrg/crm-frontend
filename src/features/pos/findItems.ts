import type { SellableAccessory, SellableDevice } from '../../lib/types'
import { title, type CartLine } from './logic'

// Finding an item by typing, for counters without a barcode scanner.

export type FoundItem =
  | { kind: 'device'; key: string; title: string; detail: string; price: number; device: SellableDevice }
  | { kind: 'accessory'; key: string; title: string; detail: string; price: number; accessory: SellableAccessory }

const tail = (s: string | null) => (s ? s.slice(-4) : '')

/**
 * Words are ANDed; each must appear in the item's brand, model, colour, storage, SKU or IMEI/serial text, so
 * "nova 128 black" and "3518" (the last digits of an IMEI) both work. Phones and accessories already in the cart
 * are left out. Returns at most `limit` items and the total number of matches.
 */
export function findItems(devices: SellableDevice[], accessories: SellableAccessory[], term: string, cart: CartLine[], limit = 10): { items: FoundItem[]; total: number } {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0 || term.trim().length < 2) return { items: [], total: 0 }
  const matches = (haystack: string) => words.every((w) => haystack.toLowerCase().includes(w))
  const items: FoundItem[] = []
  for (const d of devices) {
    if (!d.variant || !d.variant.is_active || d.status !== 'in_stock') continue
    if (cart.some((c) => c.kind === 'device' && c.itemId === d.id)) continue
    const t = title(d.variant)
    if (!matches(`${t} ${d.variant.sku} ${d.imei1 ?? ''} ${d.imei2 ?? ''} ${d.serial_number ?? ''}`)) continue
    items.push({ kind: 'device', key: `d:${d.id}`, title: t, detail: `IMEI ending ${tail(d.imei1 ?? d.serial_number)}`, price: d.variant.selling_price, device: d })
  }
  for (const a of accessories) {
    if (a.on_hand <= 0 || cart.some((c) => c.kind === 'accessory' && c.variantId === a.id)) continue
    const t = title(a)
    if (!matches(`${t} ${a.sku}`)) continue
    items.push({ kind: 'accessory', key: `a:${a.id}`, title: t, detail: `${a.on_hand} in stock`, price: a.selling_price, accessory: a })
  }
  items.sort((x, y) => x.title.localeCompare(y.title) || x.detail.localeCompare(y.detail))
  return { items: items.slice(0, limit), total: items.length }
}
