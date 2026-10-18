// Product specifications, photos and the Storage bucket for the browser-smoke stand-in server. NOT the real backend.
// It enforces what a real local Supabase enforced in the integration run: staff-only writes, 2 MiB, JPEG/PNG/WebP, the
// products/<folder>/<file> layout, public read of stored files, one primary photo per product (unique index), and
// unique specification names per product and group.
import { randomUUID } from 'node:crypto'

export const specs = []
export const images = []
const objects = new Map() // object name -> { type, bytes }
const LAYOUT = /^products\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const MAX = 2 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const now = () => new Date().toISOString()

const fail = (json, code, status, message, details = null) => (json(status, { code, message, details, hint: null }), true)
const storageFail = (res, status, error, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ statusCode: String(status), error, message }))
  return true
}

/** The file part of a multipart/form-data body, as raw bytes. */
function filePart(raw, contentType) {
  const boundary = /boundary=(.+)$/.exec(contentType ?? '')?.[1]
  if (!boundary) return null
  const marker = Buffer.from(`--${boundary}`)
  let pos = raw.indexOf(marker)
  while (pos >= 0) {
    const next = raw.indexOf(marker, pos + marker.length)
    if (next < 0) break
    const part = raw.subarray(pos + marker.length, next)
    const headEnd = part.indexOf('\r\n\r\n')
    const head = part.subarray(0, headEnd).toString('latin1')
    if (/filename=/.test(head)) {
      const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? ''
      let bytes = part.subarray(headEnd + 4)
      if (bytes.length >= 2 && bytes[bytes.length - 2] === 13 && bytes[bytes.length - 1] === 10) bytes = bytes.subarray(0, bytes.length - 2)
      return { type, bytes }
    }
    pos = next
  }
  return null
}

/** Public files need no login (this is what the website and an <img> tag use). */
export function handleMediaPublic({ url, res }) {
  const prefix = '/storage/v1/object/public/product-images/'
  if (!url.pathname.startsWith(prefix)) return false
  const name = decodeURIComponent(url.pathname.slice(prefix.length))
  const o = objects.get(name)
  if (!o) return storageFail(res, 400, 'Bad Request', 'Object not found')
  res.writeHead(200, { 'Content-Type': o.type, 'Cache-Control': 'public, max-age=31536000' })
  res.end(o.bytes)
  return true
}

export function handleMedia({ table, req, url, raw, payload, json, res, wantsObject, returnsRows, me }) {
  const params = url.searchParams

  // ---- Storage API (authenticated writes)
  if (url.pathname.startsWith('/storage/v1/object/product-images/') && req.method === 'POST') {
    const name = decodeURIComponent(url.pathname.slice('/storage/v1/object/product-images/'.length))
    if (!LAYOUT.test(name) || name.includes('..')) return storageFail(res, 403, 'Unauthorized', 'new row violates row-level security policy')
    const part = filePart(raw, req.headers['content-type'])
    if (!part) return storageFail(res, 400, 'Bad Request', 'invalid multipart body')
    if (!TYPES.includes(part.type)) return storageFail(res, 415, 'Invalid Mime Type', `mime type ${part.type} is not supported`)
    if (part.bytes.length > MAX) return storageFail(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size')
    if (objects.has(name)) return storageFail(res, 409, 'Duplicate', 'The resource already exists')
    objects.set(name, part)
    json(200, { Key: `product-images/${name}`, Id: randomUUID() })
    return true
  }
  if (url.pathname === '/storage/v1/object/product-images' && req.method === 'DELETE') {
    const removed = (payload?.prefixes ?? []).filter((p) => objects.delete(p)).map((name) => ({ name }))
    json(200, removed)
    return true
  }

  // ---- specifications
  if (table === 'product_specifications') {
    const pid = params.get('product_id')?.slice(3)
    if (req.method === 'GET') {
      const rows = specs.filter((s) => !pid || s.product_id === pid).sort((a, b) => a.sort_order - b.sort_order || a.spec_key.localeCompare(b.spec_key))
      json(200, rows)
      return true
    }
    if (req.method === 'POST') {
      if (specs.some((s) => s.product_id === payload.product_id && s.group_name === payload.group_name && s.spec_key === payload.spec_key))
        return fail(json, '23505', 409, 'duplicate key value violates unique constraint "product_specifications_product_id_group_name_spec_key_key"', `Key (product_id, group_name, spec_key)=(${payload.product_id}, ${payload.group_name}, ${payload.spec_key}) already exists.`)
      specs.push({ id: randomUUID(), sort_order: 0, ...payload })
      res.writeHead(201).end()
      return true
    }
    const id = params.get('id')?.slice(3)
    const target = specs.find((s) => s.id === id)
    if (req.method === 'PATCH') {
      if (target && specs.some((s) => s.id !== id && s.product_id === target.product_id && s.group_name === (payload.group_name ?? target.group_name) && s.spec_key === (payload.spec_key ?? target.spec_key)))
        return fail(json, '23505', 409, 'duplicate key value violates unique constraint "product_specifications_product_id_group_name_spec_key_key"', 'Key (...) already exists.')
      if (target) Object.assign(target, payload)
      return (returnsRows ? json(200, target ? [{ id }] : []) : res.writeHead(204).end()), true
    }
    if (req.method === 'DELETE') {
      if (target) specs.splice(specs.indexOf(target), 1)
      return json(200, target ? [{ id }] : []), true
    }
  }

  // ---- photo rows
  if (table === 'product_images') {
    const pid = params.get('product_id')?.slice(3)
    if (req.method === 'GET') {
      let rows = images.filter((i) => !pid || i.product_id === pid)
      rows = rows.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      const sel = params.get('select') ?? ''
      if (sel === 'sort_order') rows = rows.slice().sort((a, b) => b.sort_order - a.sort_order).slice(0, Number(params.get('limit') ?? 1000)).map((r) => ({ sort_order: r.sort_order }))
      json(200, rows)
      return true
    }
    if (req.method === 'POST') {
      if (!LAYOUT.test(payload.storage_path) || payload.storage_path.includes('..')) return fail(json, '23514', 400, 'new row for relation "product_images" violates check constraint "product_images_path_layout"')
      if (images.some((i) => i.storage_path === payload.storage_path)) return fail(json, '23505', 409, 'duplicate key value violates unique constraint "product_images_storage_path_key"', `Key (storage_path)=(${payload.storage_path}) already exists.`)
      if (payload.is_primary && images.some((i) => i.product_id === payload.product_id && i.is_primary)) return fail(json, '23505', 409, 'duplicate key value violates unique constraint "product_images_one_primary"', 'Key (product_id)=(...) already exists.')
      const row = { id: randomUUID(), alt_text: '', sort_order: 0, is_primary: false, created_at: now(), ...payload }
      images.push(row)
      return (returnsRows ? json(201, wantsObject ? row : [row]) : res.writeHead(201).end()), true
    }
    const id = params.get('id')?.slice(3)
    if (req.method === 'PATCH') {
      let hit = images
      if (id) hit = hit.filter((i) => i.id === id)
      if (pid) hit = hit.filter((i) => i.product_id === pid)
      if (params.get('is_primary') === 'eq.true') hit = hit.filter((i) => i.is_primary)
      if (payload.is_primary === true && images.some((i) => i.product_id === (hit[0]?.product_id ?? '') && i.is_primary && i.id !== hit[0]?.id))
        return fail(json, '23505', 409, 'duplicate key value violates unique constraint "product_images_one_primary"', 'Key (product_id)=(...) already exists.')
      hit.forEach((i) => Object.assign(i, payload))
      return (returnsRows ? json(200, hit.map((i) => ({ id: i.id }))) : res.writeHead(204).end()), true
    }
    if (req.method === 'DELETE') {
      const target = images.find((i) => i.id === id)
      if (target) images.splice(images.indexOf(target), 1)
      return json(200, target ? [{ id }] : []), true
    }
  }
  void me
  return false
}
