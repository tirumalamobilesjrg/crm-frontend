// Minimal stand-in for Supabase Auth + PostgREST, ONLY to drive the browser smoke test.
// It is not the real backend and proves nothing about the database. Its accounts are fictional and exist only inside
// this process; they are not credentials for anything. Behaviour that matters to the UI is copied from what a real
// local Supabase returned (see docs/STATUS.md): zero-row updates succeed silently, received purchases are frozen,
// duplicate IMEIs raise 23505 with the real message/details shape.
import http from 'node:http'
import { randomUUID } from 'node:crypto'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const USERS = {
  'admin@example.test': { id: '11111111-1111-1111-1111-111111111111', pw: 'admin-pw', profile: { full_name: 'Asha Admin', role: 'admin' } },
  'manager@example.test': { id: '22222222-2222-2222-2222-222222222222', pw: 'manager-pw', profile: { full_name: 'Mohan Manager', role: 'manager' } },
}
const byId = (id) => Object.values(USERS).find((u) => u.id === id)
const log = []
const rpcLog = []

// ---- in-memory purchasing data
const PHONE = { id: 'v-phone', sku: 'NOVA-X1-8-128', color: 'Black', ram_gb: 8, storage_gb: 128, tracking_mode: 'serialized', is_active: true, product: { name: 'Nova X1' } }
const CASE = { id: 'v-case', sku: 'NOVA-CASE', color: 'Black', ram_gb: null, storage_gb: null, tracking_mode: 'quantity', is_active: true, product: { name: 'Nova Case' } }
const variants = [PHONE, CASE]
const suppliers = [{ id: 's-metro', name: 'Metro Traders', phone: null, email: null, address: null, notes: null, is_active: true }]
const purchases = []
const lines = []
const IMEIS_IN_STOCK = new Set(['356938035643809']) // an IMEI that is already received, to provoke the duplicate error
const idempotency = new Map()
let purchasesListCalls = 0

const totalOf = (pid) => lines.filter((l) => l.purchase_id === pid).reduce((n, l) => n + l.quantity * l.unit_cost, 0)
const withTotals = (p) => ({ ...p, total: totalOf(p.id) })
const embedPurchase = (p) => ({ ...withTotals(p), supplier: { name: suppliers.find((s) => s.id === p.supplier_id)?.name ?? null } })
const embedLine = (l) => {
  const v = variants.find((x) => x.id === l.variant_id)
  return { ...l, line_total: l.quantity * l.unit_cost, variant: v ? { sku: v.sku, color: v.color, ram_gb: v.ram_gb, storage_gb: v.storage_gb, tracking_mode: v.tracking_mode, product: v.product } : null }
}
const filtered = (rows, params) => {
  let out = rows
  for (const [k, v] of params.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue
    if (v.startsWith('eq.')) out = out.filter((r) => String(r[k]) === v.slice(3))
  }
  return out
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    log.push(`${req.method} ${url.pathname}${url.search}`)
    const json = (code, o, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(o)) }
    const send = (arr, wantsObject, code = 200) => {
      if (!wantsObject) return json(code, arr)
      if (arr.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${arr.length} rows` })
      return json(code, arr[0])
    }
    if (url.pathname === '/__log') return json(200, log)
    if (url.pathname === '/__rpc') return json(200, rpcLog)
    // test control hook: another user finalises/cancels a purchase while this page is open (stand-in only)
    if (url.pathname === '/__set_status') {
      const p = purchases.find((x) => x.supplier_invoice_no === url.searchParams.get('invoice'))
      if (p) p.status = url.searchParams.get('status')
      return json(200, { ok: Boolean(p) })
    }
    if (url.pathname === '/auth/v1/token') {
      const { email, password } = JSON.parse(body || '{}')
      const u = USERS[email]
      if (!u || u.pw !== password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return json(200, { access_token: jwt(u.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: { id: u.id, aud: 'authenticated', role: 'authenticated', email } })
    }
    if (url.pathname === '/auth/v1/logout') return res.writeHead(204).end()
    if (url.pathname === '/auth/v1/user') {
      const sub = JSON.parse(Buffer.from((req.headers.authorization ?? '').split('.')[1] ?? 'e30', 'base64url').toString() || '{}').sub
      const u = byId(sub); return u ? json(200, { id: u.id, aud: 'authenticated', role: 'authenticated', email: 'x' }) : json(401, { msg: 'bad' })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object')
    const returnsRows = (req.headers.prefer ?? '').includes('return=representation')
    const sub = (() => { try { return JSON.parse(Buffer.from((req.headers.authorization ?? '').split('.')[1], 'base64url').toString()).sub } catch { return null } })()
    const me = byId(sub)
    if (!me) return json(401, { code: '42501', message: 'permission denied' })
    if (req.method === 'HEAD') return res.writeHead(200, { 'Content-Range': '0-0/5' }).end()
    const payload = body ? JSON.parse(body) : null

    if (table === 'staff_profiles') {
      const row = { user_id: me.id, ...me.profile, phone: null, is_active: true, created_at: '2026-01-01T00:00:00Z' }
      const filter = url.searchParams.get('user_id')
      if (filter) { const u = byId(filter.replace('eq.', '')); return u ? json(200, [{ user_id: u.id, ...u.profile, phone: null, is_active: true, created_at: '2026-01-01T00:00:00Z' }]) : json(200, []) }
      return wantsObject ? json(200, row) : json(200, Object.values(USERS).map((u) => ({ user_id: u.id, ...u.profile, phone: null, is_active: true, created_at: '2026-01-01T00:00:00Z' })))
    }
    if (table === 'discount_policies') return json(200, [
      { role: 'admin', can_discount: true, max_percent: 100, max_amount: null, can_approve: true, configured_at: null },
      { role: 'manager', can_discount: false, max_percent: 0, max_amount: null, can_approve: false, configured_at: null }])
    if (table === 'products') return json(200, [
      { id: 'p1', brand_id: 'b1', category_id: 'c1', name: 'Nova X1', slug: 'nova-x1', description: 'Test phone', is_published: true, published_at: '2026-01-01', updated_at: '2026-01-01', brand: { name: 'Nova' }, category: { name: 'Smartphones' } }])

    if (table === 'product_variants' && req.method === 'GET') return json(200, variants)

    if (table === 'suppliers') {
      if (req.method === 'GET') return send(filtered(suppliers, url.searchParams), wantsObject)
      if (req.method === 'POST') {
        if (suppliers.some((s) => s.name.toLowerCase() === String(payload.name).toLowerCase()))
          return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "suppliers_name_key"', details: `Key (lower(name::text))=(${String(payload.name).toLowerCase()}) already exists.`, hint: null })
        const row = { id: randomUUID(), phone: null, email: null, address: null, notes: null, is_active: true, ...payload }
        suppliers.push(row)
        return returnsRows ? send([row], wantsObject, 201) : res.writeHead(201).end()
      }
      if (req.method === 'PATCH') {
        const hit = filtered(suppliers, url.searchParams); hit.forEach((r) => Object.assign(r, payload))
        return returnsRows ? json(200, hit) : res.writeHead(204).end()
      }
    }

    if (table === 'purchases') {
      if (req.method === 'GET') {
        const respond = () => send(filtered(purchases, url.searchParams).map(embedPurchase), wantsObject)
        // slow first list so the smoke test can observe the loading state
        if (!wantsObject && purchasesListCalls++ === 0) return setTimeout(respond, 700)
        return respond()
      }
      if (req.method === 'POST') {
        if (purchases.some((p) => p.supplier_id === payload.supplier_id && p.supplier_invoice_no.toLowerCase() === payload.supplier_invoice_no.toLowerCase()))
          return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "purchases_supplier_invoice_key"', details: `Key (supplier_id, lower(supplier_invoice_no::text))=(${payload.supplier_id}, ${payload.supplier_invoice_no.toLowerCase()}) already exists.`, hint: null })
        const row = { id: randomUUID(), status: 'draft', received_at: null, created_at: new Date().toISOString(), ...payload }
        purchases.push(row)
        return returnsRows ? send([withTotals(row)], wantsObject, 201) : res.writeHead(201).end()
      }
      if (req.method === 'PATCH') {
        // RLS: only drafts can be updated; anything else silently matches zero rows (HTTP 200 with an empty array)
        const hit = filtered(purchases, url.searchParams).filter((p) => p.status === 'draft')
        hit.forEach((r) => Object.assign(r, payload))
        return returnsRows ? json(200, hit) : res.writeHead(204).end()
      }
    }

    if (table === 'purchase_items') {
      if (req.method === 'GET') return json(200, filtered(lines, url.searchParams).map(embedLine))
      if (req.method === 'POST') {
        const parent = purchases.find((p) => p.id === payload.purchase_id)
        if (!parent || parent.status !== 'draft') return json(400, { code: 'TM007', message: 'purchase lines can only be changed while the purchase is a draft', details: null, hint: null })
        lines.push({ id: randomUUID(), created_at: new Date().toISOString(), ...payload })
        return res.writeHead(201).end()
      }
      if (req.method === 'DELETE') {
        // RLS hides lines of non-draft purchases from DELETE, so zero rows are removed without any error
        const hit = filtered(lines, url.searchParams).filter((l) => purchases.find((p) => p.id === l.purchase_id)?.status === 'draft')
        hit.forEach((l) => lines.splice(lines.indexOf(l), 1))
        return returnsRows ? json(200, hit.map((l) => ({ id: l.id }))) : res.writeHead(204).end()
      }
    }

    if (table === 'rpc/receive_purchase' && req.method === 'POST') {
      rpcLog.push({ key: payload.p_idempotency_key, purchase: payload.p_purchase_id, units: payload.p_units })
      const seen = idempotency.get(payload.p_idempotency_key)
      const hash = JSON.stringify([payload.p_purchase_id, payload.p_units])
      if (seen) return seen.hash === hash ? json(200, { ...seen.response, replayed: true }) : json(409, { code: 'TM002', message: 'idempotency key was already used with a different request', details: null, hint: null })
      const p = purchases.find((x) => x.id === payload.p_purchase_id)
      if (!p) return json(400, { code: 'TM003', message: 'purchase does not exist', details: null, hint: null })
      if (p.status !== 'draft') return json(400, { code: 'TM007', message: `purchase is already ${p.status}`, details: null, hint: null })
      const pl = lines.filter((l) => l.purchase_id === p.id)
      if (pl.length === 0) return json(400, { code: 'TM007', message: 'purchase has no lines', details: null, hint: null })
      for (const l of pl.filter((x) => variants.find((v) => v.id === x.variant_id)?.tracking_mode === 'serialized')) {
        const got = payload.p_units.filter((u) => u.purchase_item_id === l.id).length
        if (got !== l.quantity) return json(400, { code: 'TM003', message: `purchase line ${l.id} expects ${l.quantity} units but ${got} were supplied`, details: null, hint: null })
      }
      const seenHere = new Set()
      for (const u of payload.p_units) {
        const v = u.imei1 ?? u.serial_number
        if (IMEIS_IN_STOCK.has(v) || seenHere.has(v))
          return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "inventory_items_imei1_key"', details: `Key (imei1)=(${v}) already exists.`, hint: null })
        seenHere.add(v)
      }
      seenHere.forEach((v) => IMEIS_IN_STOCK.add(v))
      p.status = 'received'; p.received_at = new Date().toISOString()
      const qtyLines = pl.filter((x) => variants.find((v) => v.id === x.variant_id)?.tracking_mode === 'quantity')
      const response = { purchase_id: p.id, units_received: payload.p_units.length, quantity_lines_received: qtyLines.length, quantity_units_received: qtyLines.reduce((n, l) => n + l.quantity, 0), replayed: false }
      idempotency.set(payload.p_idempotency_key, { hash, response })
      return json(200, response)
    }
    return json(200, [])
  })
})
server.listen(54399, () => console.log('mock supabase on 54399'))
