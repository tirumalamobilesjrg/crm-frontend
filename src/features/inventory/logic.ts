import { luhnValid, SERIAL_PATTERN } from '../../lib/imei'
import type { AdjustmentReason, InventoryItem, InventoryStatus, VariantLabelInfo } from '../../lib/types'
import type { IdentifierChanges } from '../../api/inventory'
import { PAGE_SIZE } from '../../api/inventory'

export const STATUS_LABEL: Record<InventoryStatus, string> = {
  in_stock: 'In stock',
  sold: 'Sold',
  damaged: 'Damaged',
  lost: 'Lost',
  returned_to_supplier: 'Returned to supplier',
}
export const STATUS_TONE: Record<InventoryStatus, 'good' | 'neutral' | 'warn' | 'bad'> = {
  in_stock: 'good',
  sold: 'neutral',
  damaged: 'warn',
  lost: 'bad',
  returned_to_supplier: 'neutral',
}
export const STATUSES = Object.keys(STATUS_LABEL) as InventoryStatus[]

export const REASON_LABEL: Record<AdjustmentReason, string> = {
  damaged: 'Damaged',
  lost: 'Lost',
  found: 'Found again',
  repaired: 'Repaired (back in stock)',
  returned_to_supplier: 'Returned to supplier',
  correction: 'Stock count correction',
}

export const CONDITION_LABEL = { new: 'New', refurbished: 'Refurbished', used: 'Used' } as const

export const pageCount = (total: number): number => Math.max(1, Math.ceil(total / PAGE_SIZE))

type Named = { sku: string; color: string | null; ram_gb?: number | null; storage_gb?: number | null; product: { name: string; brand: { name: string } | null } | null }

export function variantTitle(v: Named | null | undefined): string {
  if (!v) return '—'
  const spec = [v.color, v.ram_gb ? `${v.ram_gb}GB RAM` : null, v.storage_gb ? `${v.storage_gb}GB` : null].filter(Boolean).join(' ')
  return `${v.product?.brand?.name ? v.product.brand.name + ' ' : ''}${v.product?.name ?? ''}${spec ? ' ' + spec : ''}`.trim() || v.sku
}

// ---- search

/**
 * Search text is interpolated into a PostgREST filter string, so only letters, digits, space, dot and dash survive.
 * (Commas, parentheses, quotes, % and * could otherwise change the meaning of the filter.)
 */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 .-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
}

/** Variants whose brand, product, colour, RAM/storage or SKU contain every word of the search text. */
export function matchVariantIds(index: VariantLabelInfo[], term: string): string[] {
  const words = term.toLowerCase().split(' ').filter(Boolean)
  if (words.length === 0) return []
  return index
    .filter((v) => {
      const hay = `${v.product?.brand?.name ?? ''} ${v.product?.name ?? ''} ${v.color ?? ''} ${v.ram_gb ?? ''}gb ${v.storage_gb ?? ''}gb ${v.sku}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .map((v) => v.id)
}

// ---- stock status adjustment (serialized devices)

/** Mirrors the transitions the database allows through adjust_stock. Sold and returned-to-supplier devices are final here. */
export function deviceReasonOptions(status: InventoryStatus): AdjustmentReason[] {
  switch (status) {
    case 'in_stock': return ['damaged', 'lost', 'returned_to_supplier']
    case 'damaged': return ['repaired', 'returned_to_supplier']
    case 'lost': return ['found']
    default: return []
  }
}

export const TARGET_STATUS: Record<string, InventoryStatus> = {
  damaged: 'damaged', lost: 'lost', returned_to_supplier: 'returned_to_supplier', found: 'in_stock', repaired: 'in_stock',
}

export interface StatusAdjustForm { reason: AdjustmentReason | ''; notes: string }

export function validateStatusAdjustment(f: StatusAdjustForm, status: InventoryStatus): Partial<Record<keyof StatusAdjustForm, string>> {
  const errors: Partial<Record<keyof StatusAdjustForm, string>> = {}
  if (!f.reason || !deviceReasonOptions(status).includes(f.reason)) errors.reason = 'Choose a reason.'
  if (f.notes.trim().length < 3) errors.notes = 'Explain what happened (at least 3 characters).'
  return errors
}

// ---- quantity adjustment (accessories)

export type Direction = 'add' | 'remove'

export function quantityReasonOptions(direction: Direction): AdjustmentReason[] {
  return direction === 'remove' ? ['damaged', 'lost', 'returned_to_supplier', 'correction'] : ['found', 'correction']
}

export interface QuantityAdjustForm { direction: Direction; quantity: string; reason: AdjustmentReason | ''; notes: string }

export function validateQuantityAdjustment(
  f: QuantityAdjustForm,
  onHand: number,
): { errors: Partial<Record<keyof QuantityAdjustForm, string>>; value: { delta: number; reason: AdjustmentReason; notes: string } | null } {
  const errors: Partial<Record<keyof QuantityAdjustForm, string>> = {}
  const q = f.quantity.trim()
  const qty = /^\d+$/.test(q) ? Number(q) : NaN
  if (!(qty >= 1 && qty <= 100000)) errors.quantity = 'Enter a whole number from 1 to 100,000.'
  else if (f.direction === 'remove' && qty > onHand) errors.quantity = `Only ${onHand} in stock, so you cannot remove ${qty}.`
  if (!f.reason || !quantityReasonOptions(f.direction).includes(f.reason)) errors.reason = 'Choose a reason.'
  if (f.notes.trim().length < 3) errors.notes = 'Explain the change (at least 3 characters).'
  if (Object.keys(errors).length > 0 || !f.reason) return { errors, value: null }
  return { errors, value: { delta: f.direction === 'remove' ? -qty : qty, reason: f.reason, notes: f.notes.trim() } }
}

// ---- identifier correction

export interface CorrectionForm { imei1: string; imei2: string; serial: string; reason: string }
type CorrectionKey = keyof CorrectionForm

const clean = (s: string) => s.trim()

function checkImei(value: string): string | null {
  if (!/^\d{15}$/.test(value)) return 'An IMEI is exactly 15 digits.'
  if (!luhnValid(value)) return 'Not a valid IMEI (the check digit is wrong).'
  return null
}

/** Only fields that differ from the device's current values are sent; a blank field clears that identifier. */
export function validateCorrection(
  current: Pick<InventoryItem, 'imei1' | 'imei2' | 'serial_number'>,
  f: CorrectionForm,
): { errors: Partial<Record<CorrectionKey, string>>; changes: IdentifierChanges | null } {
  const errors: Partial<Record<CorrectionKey, string>> = {}
  const imei1 = clean(f.imei1) || null
  const imei2 = clean(f.imei2) || null
  const serial = clean(f.serial).toUpperCase() || null
  if (imei1) { const e = checkImei(imei1); if (e) errors.imei1 = e }
  if (imei2) { const e = checkImei(imei2); if (e) errors.imei2 = e }
  if (serial && !SERIAL_PATTERN.test(serial)) errors.serial = 'Serial: 4 to 40 letters, digits or dashes.'
  if (!errors.imei1 && !errors.serial && !imei1 && !serial) errors.imei1 = 'A device needs an IMEI 1 or a serial number.'
  if (!errors.imei2 && imei2 && !imei1) errors.imei2 = 'IMEI 2 needs an IMEI 1.'
  if (!errors.imei2 && imei2 && imei2 === imei1) errors.imei2 = 'IMEI 2 must differ from IMEI 1.'
  if (f.reason.trim().length < 10) errors.reason = 'Give a reason of at least 10 characters (it is kept in the audit trail).'

  const changes: IdentifierChanges = {}
  if (imei1 !== current.imei1) changes.imei1 = imei1
  if (imei2 !== current.imei2) changes.imei2 = imei2
  if (serial !== current.serial_number) changes.serial_number = serial
  if (Object.keys(changes).length === 0 && !errors.imei1 && !errors.imei2 && !errors.serial) errors.imei1 = 'Nothing has changed.'
  if (Object.keys(errors).length > 0) return { errors, changes: null }
  return { errors, changes }
}
