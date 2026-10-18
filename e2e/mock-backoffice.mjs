// Back-office part of the browser-smoke stand-in server (customers, expenses, audit log, report line queries).
// NOT the real backend. It mirrors what a real local Supabase did in the integration run: Admin-only DELETE (a
// Manager's DELETE silently matches zero rows), Admin-only audit log (a Manager just gets no rows), duplicate phone
// -> 23505 customers_phone_key, and a customer who has sales cannot be deleted (23503).
import { randomUUID } from 'node:crypto'
import { customers, sales } from './mock-sales.mjs'
import { costs, VARIANTS_BY_SKU } from './mock-inventory.mjs'

export const expenses = []
const auditExtra = []
const now = () => new Date().toISOString()
let auditId = 1000

const fail = (json, code, status, message, details = null) => (json(status, { code, message, details, hint: null }), true)
const splitOr = (raw) => raw.replace(/^\(/, '').replace(/\)$/, '').split(',').map((p) => p.split('.'))
const like = (v, pat) => String(v ?? '').toLowerCase().includes(pat.replaceAll('*', '').toLowerCase())

function page(rows, params, res, wantsObject, json) {
  if (wantsObject) {
    if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null })
    return json(200, rows[0])
  }
  const limit = Number(params.get('limit') ?? 1000), offset = Number(params.get('offset') ?? 0)
  const slice = rows.slice(offset, offset + limit)
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `${offset}-${Math.max(offset, offset + slice.length - 1)}/${rows.length}` })
  res.end(JSON.stringify(slice))
}

export function handleBackOffice({ table, req, url, payload, json, res, wantsObject, returnsRows, me }) {
  const params = url.searchParams
  const isAdmin = me.profile.role === 'admin'

  // ---- customers
  if (table === 'customers') {
    if (req.method === 'GET') {
      let rows = customers.map((c) => ({ created_at: c.created_at ?? now(), ...c }))
      const id = params.get('id'); if (id?.startsWith('eq.')) rows = rows.filter((c) => c.id === id.slice(3))
      const or = params.get('or')
      if (or) { const parts = splitOr(or); rows = rows.filter((c) => parts.some(([col, , ...val]) => like(c[col], val.join('.')))) }
      rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name))
      return page(rows, params, res, wantsObject, json), true
    }
    if (req.method === 'POST') {
      if (payload.phone && customers.some((c) => c.phone === payload.phone)) return fail(json, '23505', 409, 'duplicate key value violates unique constraint "customers_phone_key"', `Key (phone)=(${payload.phone}) already exists.`)
      const row = { id: randomUUID(), phone: null, email: null, address: null, notes: null, created_at: now(), ...payload }
      customers.push(row)
      if (returnsRows) return (wantsObject ? json(201, row) : json(201, [row])), true
      return res.writeHead(201).end(), true
    }
    const id = params.get('id')?.slice(3)
    const target = customers.find((c) => c.id === id)
    if (req.method === 'PATCH') {
      if (target && payload.phone && customers.some((c) => c.id !== id && c.phone === payload.phone)) return fail(json, '23505', 409, 'duplicate key value violates unique constraint "customers_phone_key"', `Key (phone)=(${payload.phone}) already exists.`)
      if (target) Object.assign(target, payload)
      return (returnsRows ? json(200, target ? [{ id }] : []) : res.writeHead(204).end()), true
    }
    if (req.method === 'DELETE') {
      if (!isAdmin) return (json(200, []), true) // RLS: not visible to DELETE, zero rows, no error
      if (target && sales.some((s) => s.invoice.customer_id === id)) return fail(json, '23503', 409, 'update or delete on table "customers" violates foreign key constraint', 'Key is still referenced from table "invoices".')
      if (target) customers.splice(customers.indexOf(target), 1)
      return json(200, target ? [{ id }] : []), true
    }
  }

  // ---- expenses
  if (table === 'expenses') {
    const inRange = (rows) => {
      let out = rows
      for (const v of params.getAll('expense_date')) { if (v.startsWith('gte.')) out = out.filter((e) => e.expense_date >= v.slice(4)); if (v.startsWith('lte.')) out = out.filter((e) => e.expense_date <= v.slice(4)) }
      const cat = params.get('category'); if (cat?.startsWith('eq.')) out = out.filter((e) => e.category === cat.slice(3))
      return out
    }
    if (req.method === 'GET') {
      const rows = inRange(expenses).slice().sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at))
      return page(rows, params, res, false, json), true
    }
    if (req.method === 'POST') {
      if (!(payload.amount > 0)) return fail(json, '23514', 400, 'new row for relation "expenses" violates check constraint "expenses_amount_check"', 'Failing row contains (...)')
      const row = { id: randomUUID(), created_at: now(), ...payload }
      expenses.push(row)
      auditExtra.push({ id: ++auditId, occurred_at: now(), actor_id: me.id, actor_role: me.profile.role, action: 'expenses.insert', table_name: 'expenses', record_id: row.id, detail: { amount: row.amount } })
      return (returnsRows ? json(201, wantsObject ? row : [row]) : res.writeHead(201).end()), true
    }
    const id = params.get('id')?.slice(3)
    const target = expenses.find((e) => e.id === id)
    if (req.method === 'PATCH') { if (target) { Object.assign(target, payload); auditExtra.push({ id: ++auditId, occurred_at: now(), actor_id: me.id, actor_role: me.profile.role, action: 'expenses.update', table_name: 'expenses', record_id: id, detail: { amount: target.amount } }) } return (returnsRows ? json(200, target ? [{ id }] : []) : res.writeHead(204).end()), true }
    if (req.method === 'DELETE') {
      if (!isAdmin) return (json(200, []), true)
      if (target) { expenses.splice(expenses.indexOf(target), 1); auditExtra.push({ id: ++auditId, occurred_at: now(), actor_id: me.id, actor_role: 'admin', action: 'expenses.delete', table_name: 'expenses', record_id: id, detail: null }) }
      return json(200, target ? [{ id }] : []), true
    }
  }

  // ---- report line queries (sale_items with the sale date and the device cost)
  if (table === 'sale_items' && req.method === 'GET') {
    const bounds = params.getAll('sale.sold_at')
    const gte = bounds.find((b) => b.startsWith('gte.'))?.slice(4), lte = bounds.find((b) => b.startsWith('lte.'))?.slice(4)
    const rows = []
    for (const s of sales) {
      if ((gte && s.sale.sold_at < gte) || (lte && s.sale.sold_at > lte)) continue
      for (const l of s.items) {
        const v = VARIANTS_BY_SKU[l.sku]
        rows.push({ quantity: l.quantity, unit_price: l.unit_price, discount_amount: l.discount_amount, line_total: l.line_total, variant: v ? { sku: v.sku, product: v.product } : null, item: l.device_id ? { cost: costs.has(l.device_id) ? { cost_price: costs.get(l.device_id) } : null } : null, sale: { sold_at: s.sale.sold_at } })
      }
    }
    return page(rows, params, res, false, json), true
  }

  // ---- audit log: Admin only (a Manager simply gets no rows)
  if (table === 'audit_logs' && req.method === 'GET') {
    if (!isAdmin) return (res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': '*/0' }), res.end('[]')), true
    let rows = [
      ...sales.map((s, i) => ({ id: 1 + i, occurred_at: s.sale.sold_at, actor_id: s.sale.sold_by, actor_role: 'manager', action: 'sale.finalized', table_name: 'sales', record_id: s.sale.id, detail: { invoice_number: s.invoice.invoice_number, total: s.invoice.grand_total } })),
      ...auditExtra,
    ]
    const a = params.get('action'); if (a?.startsWith('ilike.')) rows = rows.filter((r) => like(r.action, a.slice(6)))
    const t = params.get('table_name'); if (t?.startsWith('ilike.')) rows = rows.filter((r) => like(r.table_name, t.slice(6)))
    rows = rows.sort((x, y) => y.id - x.id)
    return page(rows, params, res, false, json), true
  }
  return false
}
