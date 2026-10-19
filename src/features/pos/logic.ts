import { parseRupees, toPaise } from '../../lib/money'
import type { DiscountApproval, DiscountPolicy, PaymentMethod, SellableAccessory, SellableDevice } from '../../lib/types'
import type { FinalizeSaleInput, SaleLineInput } from '../../api/sales'

// Everything here mirrors rules the DATABASE enforces in finalize_sale. It exists to give the cashier fast, specific
// feedback; the server remains the authority and may still refuse (and its answer is what gets shown).
// All money is compared in integer paise.

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', cheque: 'Cheque' }
export const PAYMENT_METHODS = Object.keys(PAYMENT_LABEL) as PaymentMethod[]

export interface DeviceLine {
  kind: 'device'
  key: string
  itemId: string
  title: string
  sku: string
  identifier: string
  mrp: number
  selling: number
  unitPrice: string
  discount: string
}
export interface AccessoryLine {
  kind: 'accessory'
  key: string
  variantId: string
  title: string
  sku: string
  mrp: number
  selling: number
  onHand: number
  quantity: string
  unitPrice: string
  discount: string
}
export type CartLine = DeviceLine | AccessoryLine

const rupees = (n: number): string => String(n)

export function title(v: { sku: string; color?: string | null; ram_gb?: number | null; storage_gb?: number | null; product: { name: string; brand: { name: string } | null } | null }): string {
  const spec = [v.color, v.ram_gb ? `${v.ram_gb}GB RAM` : null, v.storage_gb ? `${v.storage_gb}GB` : null].filter(Boolean).join(' ')
  return `${v.product?.brand?.name ? v.product.brand.name + ' ' : ''}${v.product?.name ?? ''}${spec ? ' ' + spec : ''}`.trim() || v.sku
}

export type DeviceCheck = { ok: true; line: DeviceLine } | { ok: false; error: string }

/** Turns a looked-up device into a cart line, or says exactly why it cannot be sold. */
export function deviceToLine(devices: SellableDevice[], term: string, cart: CartLine[]): DeviceCheck {
  const d = devices[0]
  if (!d) return { ok: false, error: `No device with IMEI or serial number ${term} was found.` }
  if (devices.length > 1) return { ok: false, error: 'More than one device matches. Scan the full IMEI.' }
  const who = d.imei1 ?? d.serial_number ?? term
  if (d.status !== 'in_stock') {
    const why = { sold: 'already sold', damaged: 'marked damaged', lost: 'marked lost', returned_to_supplier: 'returned to the supplier', in_stock: '' }[d.status]
    return { ok: false, error: `${who} is ${why}, so it cannot be sold.` }
  }
  if (!d.variant || !d.variant.is_active) return { ok: false, error: `${who} belongs to a variant that is not active.` }
  if (cart.some((l) => l.kind === 'device' && l.itemId === d.id)) return { ok: false, error: `${who} is already in this sale.` }
  return {
    ok: true,
    line: {
      kind: 'device', key: `d:${d.id}`, itemId: d.id, title: title(d.variant), sku: d.variant.sku, identifier: who,
      mrp: d.variant.mrp, selling: d.variant.selling_price, unitPrice: rupees(d.variant.selling_price), discount: '',
    },
  }
}

export function accessoryToLine(a: SellableAccessory): AccessoryLine {
  return { kind: 'accessory', key: `a:${a.id}`, variantId: a.id, title: title(a), sku: a.sku, mrp: a.mrp, selling: a.selling_price, onHand: a.on_hand, quantity: '1', unitPrice: rupees(a.selling_price), discount: '' }
}

// ---- amounts

export interface LineErrors { unitPrice?: string; quantity?: string; discount?: string }

export interface LineAmounts {
  qty: number | null
  pricePaise: number | null
  discountPaise: number | null
  grossPaise: number
  netPaise: number
  errors: LineErrors
}

export function lineAmounts(line: CartLine): LineAmounts {
  const errors: LineErrors = {}
  const price = parseRupees(line.unitPrice)
  const pricePaise = price !== null && price > 0 ? toPaise(price) : null
  if (pricePaise === null) errors.unitPrice = 'Enter the selling price in rupees (at most 2 decimals).'
  else if (pricePaise > toPaise(line.mrp)) errors.unitPrice = `Above the MRP of ₹${line.mrp}. The database will not allow it.`
  else if (pricePaise < toPaise(line.selling)) errors.unitPrice = `Below the selling price of ₹${line.selling}. To sell for less, enter the reduction in the Discount box.`

  let qty: number | null = 1
  if (line.kind === 'accessory') {
    const q = line.quantity.trim()
    qty = /^\d+$/.test(q) ? Number(q) : null
    if (qty === null || qty < 1 || qty > 1000) { errors.quantity = 'Quantity must be a whole number from 1 to 1000.'; qty = null }
    else if (qty > line.onHand) errors.quantity = `Only ${line.onHand} in stock.`
  }

  const gross = pricePaise !== null && qty !== null ? pricePaise * qty : 0
  let discountPaise: number | null = 0
  if (line.discount.trim() !== '') {
    const d = parseRupees(line.discount)
    discountPaise = d === null ? null : toPaise(d)
    if (discountPaise === null) errors.discount = 'Enter the discount in rupees (at most 2 decimals), or leave it empty.'
    else if (discountPaise > gross) errors.discount = 'The discount cannot be more than the line amount.'
  }
  const net = gross - (discountPaise ?? 0)
  return { qty, pricePaise, discountPaise, grossPaise: gross, netPaise: Math.max(0, net), errors }
}

export interface CartTotals { subtotalPaise: number; discountPaise: number; totalPaise: number }

export function cartTotals(lines: CartLine[]): CartTotals {
  let subtotal = 0
  let discount = 0
  for (const l of lines) {
    const a = lineAmounts(l)
    subtotal += a.grossPaise
    discount += Math.min(a.discountPaise ?? 0, a.grossPaise)
  }
  return { subtotalPaise: subtotal, discountPaise: discount, totalPaise: subtotal - discount }
}

// ---- discount authority (mirrors app.finalize_sale)

/** round(gross * percent / 100, 2) in paise, half away from zero like PostgreSQL numeric rounding. */
export function maxLineDiscountPaise(grossPaise: number, percent: number): number {
  const hundredths = Math.round(percent * 100) // percent has at most 2 decimals
  return Math.floor((grossPaise * hundredths + 5000) / 10000)
}

export interface Authority { allowed: boolean; why: string | null }

type PolicyLimits = Pick<DiscountPolicy, 'can_discount' | 'max_percent' | 'max_amount'>

function withinLimits(lines: CartLine[], totalDiscount: number, p: PolicyLimits): Authority {
  if (totalDiscount === 0) return { allowed: true, why: null }
  if (!p.can_discount) return { allowed: false, why: 'Your role has no discount allowance yet.' }
  for (const l of lines) {
    const a = lineAmounts(l)
    if ((a.discountPaise ?? 0) > maxLineDiscountPaise(a.grossPaise, p.max_percent)) return { allowed: false, why: `A line discount is above the ${p.max_percent}% limit.` }
  }
  if (p.max_amount !== null && totalDiscount > toPaise(p.max_amount)) return { allowed: false, why: `The total discount is above the ₹${p.max_amount} per-sale limit.` }
  return { allowed: true, why: null }
}

/** Is the cart's discount inside the seller's own policy (no approval needed)? */
export const ownAuthority = (lines: CartLine[], policy: PolicyLimits | null): Authority =>
  withinLimits(lines, cartTotals(lines).discountPaise, policy ?? { can_discount: false, max_percent: 0, max_amount: null })

/** Is this cart line the item the approval was granted for? */
export const isApprovalItem = (l: CartLine, a: Pick<DiscountApproval, 'inventory_item_id' | 'variant_id'>): boolean =>
  (a.inventory_item_id !== null && l.kind === 'device' && l.itemId === a.inventory_item_id) ||
  (a.variant_id !== null && l.kind === 'accessory' && l.variantId === a.variant_id)

/**
 * Can this approval cover the cart's discount? An approval is for ONE phone or accessory product: it covers the discount on that
 * item only (up to its amount). A discount on any other item must fit the seller's own allowance (`own`).
 * `approverPolicy` is the approving Admin's policy when known.
 */
export function approvalAuthority(lines: CartLine[], approval: DiscountApproval, approverPolicy: (PolicyLimits & { can_approve: boolean }) | null, own: PolicyLimits | null = null, now = new Date()): Authority {
  if (approval.used_at) return { allowed: false, why: 'That approval was already used.' }
  if (new Date(approval.expires_at) <= now) return { allowed: false, why: 'That approval has expired.' }
  if (!approval.inventory_item_id && !approval.variant_id) return { allowed: false, why: 'That approval is not tied to an item. Ask an Admin for a new one.' }
  const bound = lines.filter((l) => isApprovalItem(l, approval))
  const rest = lines.filter((l) => !isApprovalItem(l, approval))
  if (bound.length === 0) return { allowed: false, why: 'That approval is for a different item than the ones in this sale.' }
  const boundDiscount = cartTotals(bound).discountPaise
  if (boundDiscount === 0) return { allowed: false, why: 'The item this approval is for has no discount in this sale.' }
  if (boundDiscount > toPaise(approval.max_amount)) return { allowed: false, why: `The discount on that item is above the approved ₹${approval.max_amount}.` }
  if (approverPolicy) {
    if (!approverPolicy.can_approve) return { allowed: false, why: 'The approver is no longer allowed to approve discounts.' }
    const r = withinLimits(bound, boundDiscount, approverPolicy)
    if (!r.allowed) return { allowed: false, why: `The approver's own limits do not cover this discount. ${r.why}` }
  }
  const otherDiscount = cartTotals(rest).discountPaise
  if (otherDiscount > 0) {
    const r = withinLimits(rest, otherDiscount, own ?? { can_discount: false, max_percent: 0, max_amount: null })
    if (!r.allowed) return { allowed: false, why: `The approval covers only its own item. ${r.why}` }
  }
  return { allowed: true, why: null }
}

/** What an approval is for, in words (shown to the Admin and the seller). */
export function approvalItemLabel(a: DiscountApproval): string {
  if (a.item?.variant) return `${title(a.item.variant)} · IMEI ending ${(a.item.imei1 ?? a.item.serial_number ?? '').slice(-4)}`
  if (a.variant) return `${title(a.variant)} (accessory)`
  return a.inventory_item_id || a.variant_id ? 'An item' : 'No item (old approval, cannot be used)'
}

// ---- whole-sale validation and payload

export interface SaleForm {
  lines: CartLine[]
  customerId: string | null
  notes: string
  discountReason: string
  approval: DiscountApproval | null
  policy: PolicyLimits | null
  approverPolicy: (PolicyLimits & { can_approve: boolean }) | null
  paymentMethod: PaymentMethod | ''
  paymentAmount: string
  paymentReference: string
}

export interface SaleErrors {
  cart?: string
  discount?: string
  reason?: string
  payment?: string
  method?: string
}

export function validateSale(f: SaleForm): { errors: SaleErrors; lineErrors: Record<string, LineErrors>; payload: FinalizeSaleInput | null } {
  const errors: SaleErrors = {}
  const lineErrors: Record<string, LineErrors> = {}
  if (f.lines.length === 0) errors.cart = 'Add at least one phone or accessory.'
  if (f.lines.length > 50) errors.cart = 'A sale can have at most 50 lines.'
  for (const l of f.lines) {
    const e = lineAmounts(l).errors
    if (Object.keys(e).length > 0) lineErrors[l.key] = e
  }

  const totals = cartTotals(f.lines)
  if (totals.discountPaise > 0) {
    if (f.discountReason.trim().length < 3) errors.reason = 'A discount needs a reason (at least 3 characters).'
    const own = ownAuthority(f.lines, f.policy)
    if (f.approval) {
      const a = approvalAuthority(f.lines, f.approval, f.approverPolicy, f.policy)
      if (!a.allowed) errors.discount = a.why ?? 'The approval does not cover this discount.'
    } else if (!own.allowed) {
      errors.discount = `${own.why} Ask an Admin for a discount approval, or reduce the discount.`
    }
  } else if (f.approval) {
    errors.discount = 'An approval is selected but the sale has no discount. Remove the approval.'
  }

  if (f.lines.length > 0 && totals.totalPaise <= 0) errors.cart = 'The sale total must be more than zero.'

  if (!f.paymentMethod) errors.method = 'Choose how the customer paid.'
  const paid = parseRupees(f.paymentAmount)
  if (paid === null) errors.payment = 'Enter the amount received in rupees (at most 2 decimals).'
  else if (toPaise(paid) !== totals.totalPaise) errors.payment = `The amount received must equal the total (₹${(totals.totalPaise / 100).toFixed(2)}).`

  if (Object.keys(errors).length > 0 || Object.keys(lineErrors).length > 0 || !f.paymentMethod || paid === null) return { errors, lineErrors, payload: null }

  const items = f.lines.map((l): SaleLineInput => {
    const a = lineAmounts(l)
    const unit = (a.pricePaise as number) / 100
    const disc = (a.discountPaise ?? 0) / 100
    return l.kind === 'device'
      ? { inventory_item_id: l.itemId, unit_price: unit, discount_amount: disc }
      : { variant_id: l.variantId, quantity: a.qty as number, unit_price: unit, discount_amount: disc }
  })
  const ref = f.paymentReference.trim()
  return {
    errors,
    lineErrors,
    payload: {
      customerId: f.customerId,
      items,
      payment: { method: f.paymentMethod, amount: paid, ...(ref ? { reference: ref } : {}) },
      notes: f.notes.trim() === '' ? null : f.notes.trim(),
      discountReason: totals.discountPaise > 0 ? f.discountReason.trim() : null,
      approvalId: totals.discountPaise > 0 && f.approval ? f.approval.id : null,
    },
  }
}

// ---- inputs

/** Scanner / typed identifier: letters, digits and dash only (it is placed in a filter string). */
export const sanitizeIdentifier = (raw: string): string => raw.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40)

/** Customer search text: letters, digits, space, dot, plus and dash. */
export const sanitizeCustomerSearch = (raw: string): string => raw.replace(/[^A-Za-z0-9 .+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

export interface CustomerForm { name: string; phone: string; email: string; address: string }

export function validateCustomer(f: CustomerForm): { errors: Partial<Record<keyof CustomerForm, string>>; value: { name: string; phone: string | null; email: string | null; address: string | null } | null } {
  const errors: Partial<Record<keyof CustomerForm, string>> = {}
  const name = f.name.trim()
  if (name.length < 1 || name.length > 160) errors.name = 'Enter the customer name (up to 160 characters).'
  const phone = f.phone.replace(/[\s-]/g, '')
  if (phone !== '' && !/^\+?[0-9]{7,15}$/.test(phone)) errors.phone = 'Phone: 7 to 15 digits, optionally starting with +.'
  if (f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = 'Enter a valid email address, or leave it empty.'
  if (Object.keys(errors).length > 0) return { errors, value: null }
  return { errors, value: { name, phone: phone || null, email: f.email.trim() || null, address: f.address.trim() || null } }
}
