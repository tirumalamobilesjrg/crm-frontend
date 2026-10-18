// Inventory part of the browser-smoke stand-in server (see mock-supabase.mjs). NOT the real backend.
// It copies the behaviour a real local Supabase showed for the inventory screens: reads are allowed, direct writes are
// not offered at all, and the three RPCs enforce the same transitions / validations / idempotency as the database.
import { randomUUID } from 'node:crypto'

const luhn = (p14) => {
  let s = 0
  for (let i = 0; i < 14; i++) { let d = Number(p14[13 - i]); if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 } s += d }
  return p14 + String((10 - (s % 10)) % 10)
}
const luhnValid = (v) => /^\d{15}$/.test(v) && luhn(v.slice(0, 14)) === v
const SERIAL = /^[A-Z0-9][A-Z0-9-]{3,39}$/

export const PHONE_VARIANT = { id: 'v-phone', sku: 'NOVA-X1-8-128', color: 'Black', ram_gb: 8, storage_gb: 128, mrp: 20000, selling_price: 19000, tracking_mode: 'serialized', is_active: true, product: { name: 'X1', brand: { name: 'Nova' } } }
export const CASE_VARIANT = { id: 'v-case', sku: 'NOVA-CASE', color: 'Black', ram_gb: null, storage_gb: null, mrp: 500, selling_price: 400, tracking_mode: 'quantity', is_active: true, product: { name: 'Case', brand: { name: 'Nova' } } }
export const CABLE_VARIANT = { id: 'v-cable', sku: 'NOVA-CABLE', color: null, ram_gb: null, storage_gb: null, mrp: 300, selling_price: 250, tracking_mode: 'quantity', is_active: true, product: { name: 'Cable', brand: { name: 'Nova' } } }
export const VARIANTS_BY_SKU = {}
for (const v of [PHONE_VARIANT, CASE_VARIANT, CABLE_VARIANT]) VARIANTS_BY_SKU[v.sku] = v

const now = () => new Date().toISOString()
export const devices = []
export const movements = []
export const corrections = []
export const stock = new Map([[CASE_VARIANT.id, 20]])
export const costs = new Map()
const idem = new Map()
let movementId = 0
let listCalls = 0

const addDevice = (v) => {
  const d = { id: randomUUID(), variant_id: PHONE_VARIANT.id, imei1: null, imei2: null, serial_number: null, status: 'in_stock', condition: 'new', shelf_location: null, received_at: now(), updated_at: now(), ...v }
  devices.push(d)
  movements.push({ id: ++movementId, inventory_item_id: d.id, variant_id: d.variant_id, movement_type: 'purchase_receipt', from_status: null, to_status: 'in_stock', quantity_delta: null, balance_after: null, created_by: '22222222-2222-2222-2222-222222222222', created_at: now(), adjustment: null })
  costs.set(d.id, 15000)
  return d
}
// 30 phones already in stock (the first one is the IMEI the purchasing smoke test treats as "already received")
addDevice({ imei1: '356938035643809' })
for (let i = 0; i < 29; i++) addDevice({ imei1: luhn(String(87000000000000 + i)) })
movements.push({ id: ++movementId, inventory_item_id: null, variant_id: CASE_VARIANT.id, movement_type: 'purchase_receipt', from_status: null, to_status: null, quantity_delta: 20, balance_after: 20, created_by: '22222222-2222-2222-2222-222222222222', created_at: now(), adjustment: null })

/** Called by the purchasing mock when a purchase is received. */
export function onReceive(units, lines, variants) {
  for (const u of units) {
    const line = lines.find((l) => l.id === u.purchase_item_id)
    const d = addDevice({ imei1: u.imei1 ?? null, serial_number: u.serial_number ?? null, variant_id: line?.variant_id ?? PHONE_VARIANT.id })
    costs.set(d.id, line?.unit_cost ?? 0)
  }
  for (const l of lines) {
    const v = variants.find((x) => x.id === l.variant_id)
    if (v?.tracking_mode === 'quantity') {
      const bal = (stock.get(l.variant_id) ?? 0) + l.quantity
      stock.set(l.variant_id, bal)
      movements.push({ id: ++movementId, inventory_item_id: null, variant_id: l.variant_id, movement_type: 'purchase_receipt', from_status: null, to_status: null, quantity_delta: l.quantity, balance_after: bal, created_by: '22222222-2222-2222-2222-222222222222', created_at: now(), adjustment: null })
    }
  }
}

const embedDevice = (d) => {
  const v = [PHONE_VARIANT, CASE_VARIANT, CABLE_VARIANT].find((x) => x.id === d.variant_id) ?? PHONE_VARIANT
  return { ...d, variant: { id: v.id, sku: v.sku, color: v.color, ram_gb: v.ram_gb, storage_gb: v.storage_gb, mrp: v.mrp, selling_price: v.selling_price, is_active: true, product: v.product }, cost: costs.has(d.id) ? { cost_price: costs.get(d.id) } : null }
}

// `or` filter values look like (imei1.ilike.*49*,imei2.ilike.*49*,variant_id.in.(a,b)); commas inside () do not split.
function splitOr(raw) {
  const inner = raw.replace(/^\(/, '').replace(/\)$/, '')
  const parts = []
  let depth = 0, cur = ''
  for (const ch of inner) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  if (cur) parts.push(cur)
  return parts
}
const matchesOr = (row, parts) =>
  parts.some((p) => {
    const [col, op, ...rest] = p.split('.')
    const val = rest.join('.')
    if (op === 'eq') return String(row[col] ?? '') === val
    if (op === 'ilike') return String(row[col] ?? '').toLowerCase().includes(val.replaceAll('*', '').toLowerCase())
    if (op === 'in') return val.replace(/^\(/, '').replace(/\)$/, '').split(',').includes(String(row[col]))
    return false
  })

export function deviceRows(params) {
  let rows = devices
  const status = params.get('status')
  if (status?.startsWith('eq.')) rows = rows.filter((d) => d.status === status.slice(3))
  const id = params.get('id')
  if (id?.startsWith('eq.')) rows = rows.filter((d) => d.id === id.slice(3))
  const or = params.get('or')
  if (or) rows = rows.filter((d) => matchesOr(d, splitOr(or)))
  return rows
}

const fail = (json, code, status, message, details = null) => (json(status, { code, message, details, hint: null }), true)

/** Returns true when the request was handled. */
export function handleInventory({ table, req, url, payload, json, res, wantsObject, returnsRows }) {
  const params = url.searchParams

  if (req.method === 'HEAD' && (table === 'inventory_items' || table === 'stock_levels')) {
    const n = table === 'inventory_items' ? deviceRows(params).length : [...stock.values()].filter((v) => v > 0).length
    res.writeHead(200, { 'Content-Range': `*/${n}` }).end()
    return true
  }

  if (table === 'stock_levels' && req.method === 'GET') {
    json(200, [...stock.values()].filter((v) => v > 0).map((on_hand) => ({ on_hand })))
    return true
  }

  if (table === 'inventory_items' && req.method === 'GET') {
    const respond = () => {
      const rows = deviceRows(params).slice().reverse().map(embedDevice) // newest first
      const limit = Number(params.get('limit') ?? 1000), offset = Number(params.get('offset') ?? 0)
      const page = rows.slice(offset, offset + limit)
      if (wantsObject) {
        if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null })
        return json(200, rows[0])
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `${offset}-${offset + page.length - 1}/${rows.length}` })
      res.end(JSON.stringify(page))
    }
    // slow first list so the smoke test can observe the loading state
    if (!wantsObject && listCalls++ === 0) setTimeout(respond, 700)
    else respond()
    return true
  }

  if (table === 'product_variants' && req.method === 'GET') {
    const sel = params.get('select') ?? ''
    const mode = params.get('tracking_mode')
    if (mode === 'eq.quantity' && sel.includes('stock:stock_levels')) {
      const only = params.get('id')?.slice(3)
      const rows = [CASE_VARIANT, CABLE_VARIANT].filter((v) => !only || v.id === only).map((v) => ({ id: v.id, sku: v.sku, color: v.color, mrp: v.mrp, selling_price: v.selling_price, is_active: true, product: v.product, stock: stock.has(v.id) ? { on_hand: stock.get(v.id) } : null }))
      if (wantsObject) return rows.length === 1 ? (json(200, rows[0]), true) : (json(406, { code: 'PGRST116', message: 'no rows', details: null, hint: null }), true)
      json(200, rows)
      return true
    }
    if (mode === 'eq.serialized') { json(200, [PHONE_VARIANT]); return true }
    return false
  }

  if (table === 'inventory_item_costs' && req.method === 'GET') {
    const id = params.get('inventory_item_id')?.slice(3)
    json(200, costs.has(id) ? [{ cost_price: costs.get(id) }] : [])
    return true
  }

  if (table === 'stock_movements' && req.method === 'GET') {
    const item = params.get('inventory_item_id')
    const variant = params.get('variant_id')
    let rows = movements
    if (item?.startsWith('eq.')) rows = rows.filter((m) => m.inventory_item_id === item.slice(3))
    if (variant?.startsWith('eq.')) rows = rows.filter((m) => m.variant_id === variant.slice(3))
    if (item === 'is.null') rows = rows.filter((m) => m.inventory_item_id === null)
    json(200, rows.slice().reverse())
    return true
  }

  if (table === 'inventory_identifier_corrections' && req.method === 'GET') {
    const item = params.get('inventory_item_id')?.slice(3)
    json(200, corrections.filter((c) => c.inventory_item_id === item).slice().reverse())
    return true
  }

  // direct writes to inventory tables are not granted to the browser (mirrors the real privileges)
  if (['inventory_items', 'stock_levels', 'stock_movements', 'stock_adjustments', 'inventory_item_costs'].includes(table) && req.method !== 'GET') {
    json(401, { code: '42501', message: `permission denied for table ${table}`, details: null, hint: null })
    return true
  }

  if (table.startsWith('rpc/') && ['adjust_stock', 'adjust_quantity_stock', 'correct_item_identifiers'].includes(table.slice(4))) {
    const fn = table.slice(4)
    const key = payload.p_idempotency_key
    const hash = JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'p_idempotency_key')))
    const seen = idem.get(`${fn}:${key}`)
    if (seen) return seen.hash === hash ? (json(200, { ...seen.response, replayed: true }), true) : (fail(json, 'TM002', 409, 'idempotency key was already used with a different request'), true)
    const done = (response) => { idem.set(`${fn}:${key}`, { hash, response }); json(200, response); return true }

    if (fn === 'adjust_stock') {
      if (String(payload.p_notes ?? '').trim().length < 3) return fail(json, 'TM003', 400, 'notes are required for a stock adjustment')
      const d = devices.find((x) => x.id === payload.p_inventory_item_id)
      if (!d) return fail(json, 'TM003', 400, 'inventory item does not exist')
      const target = { damaged: 'damaged', lost: 'lost', returned_to_supplier: 'returned_to_supplier', found: 'in_stock', repaired: 'in_stock' }[payload.p_reason]
      const allowed = { in_stock: ['damaged', 'lost', 'returned_to_supplier'], damaged: ['repaired', 'returned_to_supplier'], lost: ['found'] }[d.status] ?? []
      if (!target || !allowed.includes(payload.p_reason)) return fail(json, 'TM004', 400, `cannot apply "${payload.p_reason}" to an item that is ${d.status}`)
      const from = d.status
      d.status = target; d.updated_at = now()
      movements.push({ id: ++movementId, inventory_item_id: d.id, variant_id: d.variant_id, movement_type: 'adjustment', from_status: from, to_status: target, quantity_delta: null, balance_after: null, created_by: '22222222-2222-2222-2222-222222222222', created_at: now(), adjustment: { reason: payload.p_reason, notes: payload.p_notes.trim() } })
      return done({ adjustment_id: randomUUID(), from_status: from, to_status: target, replayed: false })
    }

    if (fn === 'adjust_quantity_stock') {
      const delta = payload.p_quantity_delta
      if (String(payload.p_notes ?? '').trim().length < 3) return fail(json, 'TM003', 400, 'notes are required for a stock adjustment')
      if (!Number.isInteger(delta) || delta === 0) return fail(json, 'TM003', 400, 'quantity change must be a non-zero whole number')
      const bal = stock.get(payload.p_variant_id)
      if (![CASE_VARIANT.id, CABLE_VARIANT.id].includes(payload.p_variant_id)) return fail(json, 'TM013', 400, 'SKU does not exist or is not quantity-tracked')
      if ((bal ?? 0) + delta < 0) return fail(json, 'TM004', 400, `insufficient stock for this SKU (change ${delta})`)
      const next = (bal ?? 0) + delta
      stock.set(payload.p_variant_id, next)
      movements.push({ id: ++movementId, inventory_item_id: null, variant_id: payload.p_variant_id, movement_type: 'adjustment', from_status: null, to_status: null, quantity_delta: delta, balance_after: next, created_by: '22222222-2222-2222-2222-222222222222', created_at: now(), adjustment: { reason: payload.p_reason, notes: payload.p_notes.trim() } })
      return done({ adjustment_id: randomUUID(), balance_after: next, replayed: false })
    }

    // correct_item_identifiers
    const d = devices.find((x) => x.id === payload.p_inventory_item_id)
    if (!d) return fail(json, 'TM003', 400, 'inventory item does not exist')
    if (String(payload.p_reason ?? '').trim().length < 10) return fail(json, 'TM003', 400, 'a reason of at least 10 characters is required')
    const ch = payload.p_changes
    const next = { imei1: 'imei1' in ch ? ch.imei1 : d.imei1, imei2: 'imei2' in ch ? ch.imei2 : d.imei2, serial_number: 'serial_number' in ch ? ch.serial_number : d.serial_number }
    if (next.imei1 === d.imei1 && next.imei2 === d.imei2 && next.serial_number === d.serial_number) return fail(json, 'TM003', 400, 'the requested values are identical to the current ones')
    for (const k of ['imei1', 'imei2']) if (next[k] && !luhnValid(next[k])) return fail(json, '23514', 400, `new row for relation "inventory_items" violates check constraint "inventory_${k}_valid"`, 'Failing row contains (...)')
    if (next.serial_number && !SERIAL.test(next.serial_number)) return fail(json, '23514', 400, 'new row for relation "inventory_items" violates check constraint "inventory_serial_valid"')
    for (const k of ['imei1', 'imei2', 'serial_number']) {
      const taken = next[k] && next[k] !== d[k] && devices.some((o) => o.id !== d.id && [o.imei1, o.imei2, o.serial_number].includes(next[k]))
      // same shape the real database returned for an IMEI/serial already on another device
      if (taken) return fail(json, '23505', 409, `duplicate key value violates unique constraint "inventory_items_${k === 'serial_number' ? 'serial' : k}_key"`, `Key (${k})=(${next[k]}) already exists.`)
    }
    corrections.push({ id: randomUUID(), inventory_item_id: d.id, old_imei1: d.imei1, old_imei2: d.imei2, old_serial_number: d.serial_number, new_imei1: next.imei1, new_imei2: next.imei2, new_serial_number: next.serial_number, reason: payload.p_reason.trim(), corrected_by: '22222222-2222-2222-2222-222222222222', created_at: now() })
    Object.assign(d, next, { updated_at: now() })
    return done({ correction_id: randomUUID(), inventory_item_id: d.id, replayed: false })
  }
  return false
}

/** Test-control hook: another user changes a device's status while this page is open. */
export function forceStatus(imei, status) {
  const d = devices.find((x) => x.imei1 === imei)
  if (d) d.status = status
  return Boolean(d)
}
