import { describe, expect, it } from 'vitest'
import type { DiscountApproval, SellableAccessory, SellableDevice } from '../../lib/types'
import {
  accessoryToLine, approvalAuthority, cartTotals, deviceToLine, lineAmounts, maxLineDiscountPaise, ownAuthority, sanitizeCustomerSearch,
  sanitizeIdentifier, validateCustomer, validateSale, type AccessoryLine, type CartLine, type DeviceLine, type SaleForm,
} from './logic'
import { validateApproval } from './ApprovalsPage'

const variant = { id: 'v1', sku: 'NOVA-X1', color: 'Black', ram_gb: 8, storage_gb: 128, mrp: 20000, selling_price: 19000, is_active: true, product: { name: 'X1', brand: { name: 'Nova' } } }
const device = (over: Partial<SellableDevice> = {}): SellableDevice => ({ id: 'd1', variant_id: 'v1', imei1: '490154203237518', imei2: null, serial_number: null, status: 'in_stock', variant, ...over })
const acc: SellableAccessory = { id: 'a1', sku: 'CASE', color: 'Black', mrp: 500, selling_price: 400, is_active: true, product: { name: 'Case', brand: { name: 'Nova' } }, on_hand: 20 }

const phone = (over: Partial<DeviceLine> = {}): DeviceLine => {
  const r = deviceToLine([device()], '490154203237518', [])
  if (!r.ok) throw new Error(r.error)
  return { ...r.line, ...over }
}
const caseLine = (over: Partial<AccessoryLine> = {}): AccessoryLine => ({ ...accessoryToLine(acc), ...over })

const manager = { can_discount: true, max_percent: 5, max_amount: null }
const noAllowance = { can_discount: false, max_percent: 0, max_amount: null }
const approval = (over: Partial<DiscountApproval> = {}): DiscountApproval => ({
  id: 'ap1', requested_for: 'u1', approved_by: 'admin', max_amount: 1500, reason: 'Festival', expires_at: new Date(Date.now() + 600_000).toISOString(), used_at: null, used_in_sale_id: null, created_at: '', inventory_item_id: 'd1', variant_id: null, ...over,
})
const form = (over: Partial<SaleForm>): SaleForm => ({
  lines: [phone()], customerId: null, notes: '', discountReason: '', approval: null, policy: noAllowance, approverPolicy: null, paymentMethod: 'cash', paymentAmount: '19000.00', paymentReference: '', ...over,
})

describe('deviceToLine', () => {
  it('builds a phone line priced at the selling price, with the MRP kept for the ceiling', () => {
    const l = phone()
    expect(l).toMatchObject({ kind: 'device', itemId: 'd1', identifier: '490154203237518', mrp: 20000, selling: 19000, unitPrice: '19000', title: 'Nova X1 Black 8GB RAM 128GB' })
  })
  it('says exactly why a device cannot be sold', () => {
    expect(deviceToLine([], '123456789012345', [])).toMatchObject({ ok: false, error: expect.stringMatching(/No device with IMEI or serial number 123456789012345/) })
    for (const [status, text] of [['sold', /already sold/], ['damaged', /marked damaged/], ['lost', /marked lost/], ['returned_to_supplier', /returned to the supplier/]] as const) {
      expect(deviceToLine([device({ status })], 'x', [])).toMatchObject({ ok: false, error: expect.stringMatching(text) })
    }
  })
  it('refuses an inactive variant, a duplicate in the cart and an ambiguous match', () => {
    expect(deviceToLine([device({ variant: { ...variant, is_active: false } })], 'x', [])).toMatchObject({ ok: false, error: expect.stringMatching(/not active/) })
    expect(deviceToLine([device()], 'x', [phone()])).toMatchObject({ ok: false, error: expect.stringMatching(/already in this sale/) })
    expect(deviceToLine([device(), device({ id: 'd2' })], 'x', [])).toMatchObject({ ok: false, error: expect.stringMatching(/More than one/) })
  })
})

describe('lineAmounts', () => {
  it('computes gross, discount and net in paise', () => {
    expect(lineAmounts(phone({ discount: '1000' }))).toMatchObject({ grossPaise: 1_900_000, discountPaise: 100_000, netPaise: 1_800_000, errors: {} })
    expect(lineAmounts(caseLine({ quantity: '3', unitPrice: '399.50' }))).toMatchObject({ qty: 3, grossPaise: 119_850, netPaise: 119_850 })
  })
  it('enforces the MRP ceiling per unit, equal to the MRP is fine', () => {
    expect(lineAmounts(phone({ unitPrice: '20000' })).errors.unitPrice).toBeUndefined()
    expect(lineAmounts(phone({ unitPrice: '20000.01' })).errors.unitPrice).toMatch(/Above the MRP/)
    expect(lineAmounts(caseLine({ quantity: '2', unitPrice: '500.01' })).errors.unitPrice).toMatch(/Above the MRP/)
  })
  it('rejects bad prices, quantities and discounts', () => {
    expect(lineAmounts(phone({ unitPrice: '' })).errors.unitPrice).toBeDefined()
    expect(lineAmounts(phone({ unitPrice: '0' })).errors.unitPrice).toBeDefined()
    expect(lineAmounts(phone({ unitPrice: '10.005' })).errors.unitPrice).toBeDefined()
    for (const q of ['', '0', '1.5', '-2', '1001']) expect(lineAmounts(caseLine({ quantity: q })).errors.quantity).toBeDefined()
    expect(lineAmounts(caseLine({ quantity: '21' })).errors.quantity).toMatch(/Only 20 in stock/)
    expect(lineAmounts(phone({ discount: 'abc' })).errors.discount).toBeDefined()
    expect(lineAmounts(phone({ discount: '19000.01' })).errors.discount).toMatch(/more than the line amount/)
  })
})

describe('cartTotals', () => {
  it('sums lines and discounts exactly (no floating point drift)', () => {
    const lines: CartLine[] = [phone({ discount: '0.10' }), caseLine({ quantity: '3', unitPrice: '0.10', discount: '0.20' })]
    expect(cartTotals(lines)).toEqual({ subtotalPaise: 1_900_030, discountPaise: 30, totalPaise: 1_900_000 })
  })
})

describe('discount authority', () => {
  it('rounds the per-line limit half-up in paise like PostgreSQL', () => {
    expect(maxLineDiscountPaise(1_900_000, 5)).toBe(95_000) // 950.00
    expect(maxLineDiscountPaise(333, 10)).toBe(33) // 33.3 -> 33
    expect(maxLineDiscountPaise(335, 10)).toBe(34) // 33.5 -> 34
    expect(maxLineDiscountPaise(1_900_000, 10.5)).toBe(199_500)
  })
  it('allows exactly the limit and refuses a paisa more', () => {
    expect(ownAuthority([phone({ discount: '950' })], manager).allowed).toBe(true)
    expect(ownAuthority([phone({ discount: '950.01' })], manager).allowed).toBe(false)
  })
  it('a role with no allowance can never discount without approval', () => {
    expect(ownAuthority([phone({ discount: '1' })], noAllowance)).toMatchObject({ allowed: false, why: expect.stringMatching(/no discount allowance/) })
    expect(ownAuthority([phone()], noAllowance).allowed).toBe(true) // no discount, nothing to authorise
    expect(ownAuthority([phone({ discount: '1' })], null).allowed).toBe(false)
  })
  it('respects a per-sale cap', () => {
    const capped = { can_discount: true, max_percent: 100, max_amount: 500 }
    expect(ownAuthority([phone({ discount: '500' })], capped).allowed).toBe(true)
    expect(ownAuthority([phone({ discount: '500.01' })], capped)).toMatchObject({ allowed: false, why: expect.stringMatching(/per-sale limit/) })
  })
  it('an approval covers up to its amount, once, until it expires', () => {
    const l = [phone({ discount: '1500' })]
    expect(approvalAuthority(l, approval(), null).allowed).toBe(true)
    expect(approvalAuthority([phone({ discount: '1500.01' })], approval(), null).why).toMatch(/above the approved/)
    expect(approvalAuthority(l, approval({ used_at: '2026-10-18' }), null).why).toMatch(/already used/)
    expect(approvalAuthority(l, approval({ expires_at: new Date(Date.now() - 1000).toISOString() }), null).why).toMatch(/expired/)
  })
  it('an approval is for ONE item: other items, no discount on its item and old unbound approvals are refused', () => {
    expect(approvalAuthority([phone({ itemId: 'd2', key: 'd:d2', discount: '1000' })], approval(), null).why).toMatch(/different item/)
    expect(approvalAuthority([phone({ discount: '' })], approval(), null).why).toMatch(/has no discount/)
    expect(approvalAuthority([phone({ discount: '1000' })], approval({ inventory_item_id: null, variant_id: null }), null).why).toMatch(/not tied to an item/)
  })
  it('an accessory approval matches the accessory product, not a phone', () => {
    const forCase = approval({ inventory_item_id: null, variant_id: 'a1' })
    expect(approvalAuthority([caseLine({ quantity: '2', discount: '100' })], forCase, null).allowed).toBe(true)
    expect(approvalAuthority([phone({ discount: '100' })], forCase, null).why).toMatch(/different item/)
  })
  it("the approval does not cover a discount on a second item: that must fit the seller's own allowance", () => {
    const two = [phone({ discount: '1500' }), caseLine({ quantity: '1', discount: '40' })]
    expect(approvalAuthority(two, approval(), null, noAllowance)).toMatchObject({ allowed: false, why: expect.stringMatching(/covers only its own item/) })
    expect(approvalAuthority(two, approval(), null, { can_discount: true, max_percent: 10, max_amount: null }).allowed).toBe(true) // 40 is 10 % of 400
    expect(approvalAuthority(two, approval(), null, { can_discount: true, max_percent: 5, max_amount: null }).allowed).toBe(false)
  })
  it("an approval is also bound by the approver's own limits", () => {
    const l = [phone({ discount: '1500' })]
    expect(approvalAuthority(l, approval(), { can_discount: true, max_percent: 100, max_amount: null, can_approve: true }).allowed).toBe(true)
    expect(approvalAuthority(l, approval(), { can_discount: true, max_percent: 5, max_amount: null, can_approve: true }).why).toMatch(/approver's own limits/)
    expect(approvalAuthority(l, approval(), { can_discount: true, max_percent: 100, max_amount: null, can_approve: false }).why).toMatch(/no longer allowed/)
  })
})

describe('validateSale', () => {
  it('builds the exact finalize_sale payload for a phone and an accessory (no discount)', () => {
    const r = validateSale(form({ lines: [phone(), caseLine({ quantity: '2' })], customerId: 'c1', paymentAmount: '19800.00', paymentReference: ' till 1 ', notes: ' gift ' }))
    expect(r.errors).toEqual({})
    expect(r.payload).toEqual({
      customerId: 'c1',
      items: [
        { inventory_item_id: 'd1', unit_price: 19000, discount_amount: 0 },
        { variant_id: 'a1', quantity: 2, unit_price: 400, discount_amount: 0 },
      ],
      payment: { method: 'cash', amount: 19800, reference: 'till 1' },
      notes: 'gift',
      discountReason: null,
      approvalId: null,
    })
  })
  it('a walk-in sale has no customer; the reference is left out when empty', () => {
    const r = validateSale(form({}))
    expect(r.payload).toMatchObject({ customerId: null, payment: { method: 'cash', amount: 19000 }, notes: null })
    expect(r.payload?.payment).not.toHaveProperty('reference')
  })
  it('needs items, a payment method and an amount equal to the total', () => {
    expect(validateSale(form({ lines: [] })).errors.cart).toMatch(/at least one/)
    expect(validateSale(form({ paymentMethod: '' })).errors.method).toBeDefined()
    expect(validateSale(form({ paymentAmount: '18999.99' })).errors.payment).toMatch(/must equal the total \(₹19000.00\)/)
    expect(validateSale(form({ paymentAmount: 'abc' })).errors.payment).toBeDefined()
    expect(validateSale(form({ paymentAmount: '19000.00' })).payload).not.toBeNull()
  })
  it('refuses more than 50 lines', () => {
    const many = Array.from({ length: 51 }, (_, i) => phone({ key: `d:${i}`, itemId: `d${i}` }))
    expect(validateSale(form({ lines: many })).errors.cart).toMatch(/at most 50/)
  })
  it('reports per-line errors and sends nothing', () => {
    const bad = phone({ unitPrice: '20000.01' })
    const r = validateSale(form({ lines: [bad], paymentAmount: '20000.01' }))
    expect(r.payload).toBeNull()
    expect(r.lineErrors[bad.key]?.unitPrice).toMatch(/MRP/)
  })
  describe('discounts', () => {
    const disc = [phone({ discount: '1000' })]
    it('need a reason', () => {
      expect(validateSale(form({ lines: disc, policy: { ...manager, max_percent: 10 }, paymentAmount: '18000' })).errors.reason).toMatch(/needs a reason/)
    })
    it('inside the seller policy: allowed without an approval, reason recorded', () => {
      const r = validateSale(form({ lines: disc, policy: { ...manager, max_percent: 10 }, paymentAmount: '18000', discountReason: ' Loyal ' }))
      expect(r.errors).toEqual({})
      expect(r.payload).toMatchObject({ discountReason: 'Loyal', approvalId: null, items: [{ discount_amount: 1000 }] })
    })
    it('above the seller policy without an approval is blocked with advice', () => {
      expect(validateSale(form({ lines: disc, policy: noAllowance, paymentAmount: '18000', discountReason: 'Haggle' })).errors.discount).toMatch(/Ask an Admin for a discount approval/)
    })
    it('above the seller policy but with a valid approval: sends the approval id', () => {
      const r = validateSale(form({ lines: disc, policy: noAllowance, paymentAmount: '18000', discountReason: 'Festival', approval: approval() }))
      expect(r.errors).toEqual({})
      expect(r.payload).toMatchObject({ approvalId: 'ap1', discountReason: 'Festival' })
    })
    it('an approval that is too small, used or expired is refused', () => {
      expect(validateSale(form({ lines: disc, policy: noAllowance, paymentAmount: '18000', discountReason: 'x1', approval: approval({ max_amount: 500 }) })).errors.discount).toMatch(/above the approved/)
    })
    it('an approval with no discount is refused (the server would too)', () => {
      expect(validateSale(form({ approval: approval() })).errors.discount).toMatch(/no discount/)
    })
    it('the payment must equal the DISCOUNTED total', () => {
      expect(validateSale(form({ lines: disc, policy: { ...manager, max_percent: 10 }, discountReason: 'abc', paymentAmount: '19000' })).errors.payment).toMatch(/₹18000.00/)
    })
  })
})

describe('inputs', () => {
  it('sanitises a scanned identifier and customer search text for use in filters', () => {
    expect(sanitizeIdentifier(' 4901-5420 3237518\n')).toBe('4901-54203237518')
    expect(sanitizeIdentifier('a,b)c(d')).toBe('abcd')
    expect(sanitizeCustomerSearch(' ra,vi  +91(98) ')).toBe('ra vi +91 98')
  })
  it('validates a customer', () => {
    expect(validateCustomer({ name: '', phone: '123', email: 'x', address: '' }).errors).toEqual({ name: expect.any(String), phone: expect.any(String), email: expect.any(String) })
    expect(validateCustomer({ name: ' Ravi ', phone: '98765 43210', email: '', address: ' ' }).value).toEqual({ name: 'Ravi', phone: '9876543210', email: null, address: null })
    expect(validateCustomer({ name: 'A', phone: '+919876543210', email: 'a@b.co', address: 'x' }).value?.phone).toBe('+919876543210')
  })
  it('validates an approval grant', () => {
    expect(Object.keys(validateApproval({ requestedFor: '', amount: '0', reason: 'x', minutes: '500', target: null }).errors).sort()).toEqual(['amount', 'minutes', 'reason', 'requestedFor', 'target'])
    expect(validateApproval({ requestedFor: 'u1', amount: '1,500', reason: 'Festival', minutes: '15', target: { kind: 'device', id: 'd1', label: 'Nova X1' } }).value)
      .toEqual({ requestedFor: 'u1', maxAmount: 1500, reason: 'Festival', validMinutes: 15, inventoryItemId: 'd1' })
    expect(validateApproval({ requestedFor: 'u1', amount: '400', reason: 'Two cases', minutes: '15', target: { kind: 'accessory', id: 'v9', label: 'Case' } }).value)
      .toEqual({ requestedFor: 'u1', maxAmount: 400, reason: 'Two cases', validMinutes: 15, variantId: 'v9' })
  })
})
