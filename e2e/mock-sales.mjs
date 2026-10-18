// Sales part of the browser-smoke stand-in server (see mock-supabase.mjs). NOT the real backend.
// finalize_sale here applies the same rules a real local Supabase applied in the integration run: price <= MRP,
// device must be in stock, accessory stock, discount needs reason + (policy or single-use approval), one payment equal
// to the total, gapless invoice numbers, idempotent replay. Reads only; no table is writable by the browser.
import { randomUUID } from 'node:crypto'
import { devices, stock, movements, PHONE_VARIANT, CASE_VARIANT, CABLE_VARIANT } from './mock-inventory.mjs'

const VARIANTS = [PHONE_VARIANT, CASE_VARIANT, CABLE_VARIANT]
const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
const MANAGER_ID = '22222222-2222-2222-2222-222222222222'
const now = () => new Date().toISOString()

export const customers = []
export const approvals = [
  { id: 'ap-seed', requested_for: MANAGER_ID, approved_by: ADMIN_ID, max_amount: 1500, reason: 'Festival offer', expires_at: new Date(Date.now() + 3_600_000).toISOString(), used_at: null, used_in_sale_id: null, created_at: now() },
]
export const sales = [] // {sale, invoice, items, payment}
export const finalizeLog = [] // {key, attempt}
const idem = new Map()
let invoiceSeq = 0
let failNext = false

const fail = (json, code, status, message, details = null) => (json(status, { code, message, details, hint: null }), true)
const orParts = (raw) => raw.replace(/^\(/, '').replace(/\)$/, '').split(',')
const ilikeMatch = (v, pat) => String(v ?? '').toLowerCase().includes(pat.replaceAll('*', '').toLowerCase())

export function setFailNext(v) { failNext = v }

export function handleSales({ table, req, url, payload, json, res, wantsObject, returnsRows, me }) {
  const params = url.searchParams

  if (table === 'customers') {
    if (req.method === 'GET') {
      const or = params.get('or')
      let rows = customers
      if (or) {
        const parts = orParts(or).map((p) => p.split('.'))
        rows = rows.filter((c) => parts.some(([col, , ...val]) => ilikeMatch(c[col], val.join('.'))))
      }
      json(200, rows.slice(0, Number(params.get('limit') ?? 100)))
      return true
    }
    if (req.method === 'POST') {
      if (payload.phone && customers.some((c) => c.phone === payload.phone))
        return fail(json, '23505', 409, 'duplicate key value violates unique constraint "customers_phone_key"', `Key (phone)=(${payload.phone}) already exists.`)
      const row = { id: randomUUID(), phone: null, email: null, address: null, notes: null, ...payload }
      customers.push(row)
      if (returnsRows) return wantsObject ? (json(201, row), true) : (json(201, [row]), true)
      res.writeHead(201).end()
      return true
    }
  }

  if (table === 'discount_approvals' && req.method === 'GET') {
    let rows = me.profile.role === 'admin' ? approvals : approvals.filter((a) => a.requested_for === me.id || a.approved_by === me.id)
    const rf = params.get('requested_for')
    if (rf?.startsWith('eq.')) rows = rows.filter((a) => a.requested_for === rf.slice(3))
    if (params.get('used_at') === 'is.null') rows = rows.filter((a) => a.used_at === null)
    const exp = params.get('expires_at')
    if (exp?.startsWith('gt.')) rows = rows.filter((a) => new Date(a.expires_at) > new Date(exp.slice(3)))
    json(200, rows.slice().reverse())
    return true
  }

  if (table === 'invoices' && req.method === 'GET') {
    let rows = sales
    const cid = params.get('customer_id')
    if (cid?.startsWith('eq.')) rows = rows.filter((s) => s.invoice.customer_id === cid.slice(3))
    for (const v of params.getAll('issued_at')) {
      if (v.startsWith('gte.')) rows = rows.filter((s) => s.invoice.issued_at >= v.slice(4))
      if (v.startsWith('lte.')) rows = rows.filter((s) => s.invoice.issued_at <= v.slice(4))
    }
    const saleId = params.get('sale_id')
    if (saleId?.startsWith('eq.')) rows = rows.filter((s) => s.sale.id === saleId.slice(3))
    const or = params.get('or')
    if (or) {
      const parts = orParts(or).map((p) => p.split('.'))
      rows = rows.filter((s) => parts.some(([col, , ...val]) => ilikeMatch(s.invoice[col], val.join('.'))))
    }
    const shaped = rows.slice().reverse().map((s) => ({
      ...s.invoice,
      items: s.items,
      payments: [s.payment],
      sale: { sold_by: s.sale.sold_by, sold_at: s.sale.sold_at, discount_reason: s.sale.discount_reason, discount_basis: s.sale.discount_basis, discount_authorized_by: s.sale.discount_authorized_by, notes: s.sale.notes },
    }))
    if (wantsObject) {
      if (shaped.length !== 1) return (json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${shaped.length} rows`, hint: null }), true)
      json(200, shaped[0])
      return true
    }
    const limit = Number(params.get('limit') ?? 1000), offset = Number(params.get('offset') ?? 0)
    const page = shaped.slice(offset, offset + limit)
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `${offset}-${offset + page.length - 1}/${shaped.length}` })
    res.end(JSON.stringify(page))
    return true
  }

  if (table === 'rpc/grant_discount_approval' && req.method === 'POST') {
    if (me.profile.role !== 'admin') return fail(json, '42501', 403, 'only an Admin whose policy allows approvals may approve discounts')
    if (payload.p_requested_for === me.id) return fail(json, 'TM005', 400, 'an approval must be granted to a different user')
    if (!(payload.p_max_amount > 0)) return fail(json, 'TM003', 400, 'approved amount must be positive with at most 2 decimals')
    if (String(payload.p_reason ?? '').trim().length < 3) return fail(json, 'TM003', 400, 'a reason is required')
    const a = { id: randomUUID(), requested_for: payload.p_requested_for, approved_by: me.id, max_amount: payload.p_max_amount, reason: payload.p_reason.trim(), expires_at: new Date(Date.now() + payload.p_valid_minutes * 60_000).toISOString(), used_at: null, used_in_sale_id: null, created_at: now() }
    approvals.push(a)
    json(200, { approval_id: a.id, expires_at: a.expires_at, replayed: false })
    return true
  }

  if (table === 'rpc/finalize_sale' && req.method === 'POST') {
    finalizeLog.push({ key: payload.p_idempotency_key, items: payload.p_items, payment: payload.p_payment, approval: payload.p_discount_approval_id })
    if (failNext) { failNext = false; res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('upstream unavailable'); return true }
    const hash = JSON.stringify([payload.p_customer_id, payload.p_items, payload.p_payment, payload.p_notes, payload.p_discount_reason, payload.p_discount_approval_id])
    const seen = idem.get(payload.p_idempotency_key)
    if (seen) return seen.hash === hash ? (json(200, { ...seen.response, replayed: true }), true) : fail(json, 'TM002', 409, 'idempotency key was already used with a different request')

    const items = payload.p_items
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) return fail(json, 'TM003', 400, 'items must be an array of 1-50 lines')
    const pay = payload.p_payment
    if (!pay || typeof pay !== 'object' || Array.isArray(pay) || Object.keys(pay).some((k) => !['method', 'amount', 'reference'].includes(k)))
      return fail(json, 'TM003', 400, 'payment must be one JSON object {method, amount, reference?}; split payments are not supported')

    const lines = []
    let ord = 0
    for (const it of items) {
      ord++
      let variant, device = null, qty = 1
      if (it.inventory_item_id) {
        device = devices.find((d) => d.id === it.inventory_item_id)
        if (!device) return fail(json, 'TM003', 400, `line ${ord} refers to an unknown device or SKU`)
        if (device.status !== 'in_stock') return fail(json, 'TM004', 400, `inventory item ${device.id} is not available (status: ${device.status})`)
        variant = VARIANTS.find((v) => v.id === device.variant_id)
      } else {
        variant = VARIANTS.find((v) => v.id === it.variant_id)
        qty = it.quantity
        if (!variant) return fail(json, 'TM003', 400, `line ${ord} refers to an unknown device or SKU`)
        if ((stock.get(variant.id) ?? 0) < qty) return fail(json, 'TM004', 400, `insufficient stock for SKU ${variant.sku}`)
      }
      if (!(it.unit_price > 0)) return fail(json, 'TM003', 400, `line ${ord} has an invalid price or discount`)
      if (it.unit_price > variant.mrp) return fail(json, 'TM003', 400, `line ${ord}: unit price ${it.unit_price} is above the MRP ${variant.mrp.toFixed(2)} for SKU ${variant.sku}`)
      const gross = Math.round(it.unit_price * qty * 100), disc = Math.round((it.discount_amount ?? 0) * 100)
      if (disc < 0 || disc > gross) return fail(json, 'TM003', 400, `line ${ord} has an invalid price or discount`)
      lines.push({ ord, it, variant, device, qty, gross, disc })
    }
    const subtotal = lines.reduce((n, l) => n + l.gross, 0), discount = lines.reduce((n, l) => n + l.disc, 0), total = subtotal - discount

    let basis = 'none', authorizer = null, approval = null
    if (discount > 0) {
      if (String(payload.p_discount_reason ?? '').trim().length < 3) return fail(json, 'TM003', 400, 'a discount reason is required')
      if (me.profile.role === 'admin') { basis = 'role_limit'; authorizer = me.id } // the Admin policy allows up to 100 %
      else if (payload.p_discount_approval_id) {
        approval = approvals.find((a) => a.id === payload.p_discount_approval_id)
        if (!approval || approval.requested_for !== me.id) return fail(json, 'TM005', 400, 'discount approval not found for this user')
        if (approval.used_at) return fail(json, 'TM005', 400, 'discount approval was already used')
        if (new Date(approval.expires_at) <= new Date()) return fail(json, 'TM005', 400, 'discount approval has expired')
        if (discount > Math.round(approval.max_amount * 100)) return fail(json, 'TM005', 400, `discount ${(discount / 100).toFixed(2)} exceeds the approved amount ${approval.max_amount}`)
        basis = 'manager_approval'; authorizer = approval.approved_by
      } else return fail(json, 'TM005', 400, 'discount exceeds your limit (0 % per line); ask an approver for a discount approval')
    } else if (payload.p_discount_approval_id) return fail(json, 'TM003', 400, 'a discount approval was supplied but the sale has no discount')

    if (!['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(pay.method)) return fail(json, 'TM003', 400, 'payment method is required (cash, upi, card, bank_transfer or cheque)')
    if (Math.round(pay.amount * 100) !== total) return fail(json, 'TM006', 400, `payment (${pay.amount}) must equal the sale total (${(total / 100).toFixed(2)})`)
    const customer = payload.p_customer_id ? customers.find((c) => c.id === payload.p_customer_id) : null
    if (payload.p_customer_id && !customer) return fail(json, 'TM003', 400, 'customer does not exist')

    const saleId = randomUUID(), invoiceId = randomUUID()
    const number = `TM/26-27/${String(++invoiceSeq).padStart(6, '0')}`
    const items2 = lines.map((l) => {
      const v = l.variant
      const description = [v.product.brand.name, v.product.name, v.color, v.storage_gb ? `${v.storage_gb}GB` : null].filter(Boolean).join(' ')
      if (l.device) { l.device.status = 'sold'; l.device.updated_at = now(); movements.push({ id: movements.length + 1000, inventory_item_id: l.device.id, variant_id: v.id, movement_type: 'sale', from_status: 'in_stock', to_status: 'sold', quantity_delta: null, balance_after: null, created_by: me.id, created_at: now(), adjustment: null }) }
      else { const bal = stock.get(v.id) - l.qty; stock.set(v.id, bal); movements.push({ id: movements.length + 1000, inventory_item_id: null, variant_id: v.id, movement_type: 'sale', from_status: null, to_status: null, quantity_delta: -l.qty, balance_after: bal, created_by: me.id, created_at: now(), adjustment: null }) }
      return { device_id: l.device?.id ?? null, id: randomUUID(), line_no: l.ord, description, sku: v.sku, imei1: l.device?.imei1 ?? null, imei2: l.device?.imei2 ?? null, serial_number: l.device?.serial_number ?? null, quantity: l.qty, unit_price: l.it.unit_price, discount_amount: l.it.discount_amount ?? 0, line_total: (l.gross - l.disc) / 100 }
    })
    if (approval) { approval.used_at = now(); approval.used_in_sale_id = saleId }
    sales.push({
      sale: { id: saleId, sold_by: me.id, sold_at: now(), discount_reason: discount > 0 ? payload.p_discount_reason.trim() : null, discount_basis: basis, discount_authorized_by: authorizer, notes: payload.p_notes ?? null },
      invoice: { id: invoiceId, sale_id: saleId, invoice_number: number, issued_at: now(), shop_name: 'Tirumala Mobiles', shop_address: 'Main Road, Hyderabad', customer_id: customer?.id ?? null, customer_name: customer?.name ?? 'Walk-in customer', customer_phone: customer?.phone ?? null, customer_address: customer?.address ?? null, subtotal: subtotal / 100, discount_total: discount / 100, grand_total: total / 100 },
      items: items2,
      payment: { method: pay.method, amount: pay.amount, reference: pay.reference ?? null, received_at: now() },
    })
    const response = { sale_id: saleId, invoice_id: invoiceId, invoice_number: number, total: total / 100, discount_total: discount / 100, replayed: false }
    idem.set(payload.p_idempotency_key, { hash, response })
    json(200, response)
    return true
  }
  return false
}
