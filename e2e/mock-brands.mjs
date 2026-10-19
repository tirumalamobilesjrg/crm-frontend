// Brands, categories and the public `brand-logos` / `category-images` Storage buckets for the browser-smoke stand-in server. NOT the real backend.
// It enforces what migrations 0026 and 0027 enforce: staff-only writes, the size and type limits of each bucket (logos: 256 KiB SVG/PNG/WebP;
// category pictures: 1 MiB JPEG/PNG/WebP), the <prefix>/<folder>/<file> layout, public read of stored files, and the same layout for
// brands.logo_path and categories.image_path.
import { randomUUID } from 'node:crypto'

export const brands = [
  { id: 'b1', name: 'Nova', slug: 'nova', is_active: true, logo_path: null },
  { id: 'b2', name: 'Zenith', slug: 'zenith', is_active: true, logo_path: null },
]
export const categories = [
  { id: 'c1', name: 'Smartphones', slug: 'smartphones', is_active: true, image_path: null },
  { id: 'c2', name: 'Accessories', slug: 'accessories', is_active: true, image_path: null },
]
const SEGMENT = '[A-Za-z0-9][A-Za-z0-9_-]{0,79}'
const FILE = '[A-Za-z0-9][A-Za-z0-9._-]{0,99}'
const BUCKETS = {
  'brand-logos': { objects: new Map(), layout: new RegExp(`^brands/${SEGMENT}/${FILE}$`), max: 256 * 1024, types: ['image/svg+xml', 'image/png', 'image/webp'] }, // objects: name -> { type, bytes }
  'category-images': { objects: new Map(), layout: new RegExp(`^categories/${SEGMENT}/${FILE}$`), max: 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] },
}
const bucketOf = (pathname, prefix) => Object.keys(BUCKETS).find((b) => pathname.startsWith(`${prefix}${b}/`) || pathname === `${prefix}${b}`)

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

/** Public logo files need no login. */
export function handleBrandLogosPublic({ url, res }) {
  const bucket = bucketOf(url.pathname, '/storage/v1/object/public/')
  if (!bucket) return false
  const o = BUCKETS[bucket].objects.get(decodeURIComponent(url.pathname.slice(`/storage/v1/object/public/${bucket}/`.length)))
  if (!o) return storageFail(res, 400, 'Bad Request', 'Object not found')
  res.writeHead(200, { 'Content-Type': o.type, 'Cache-Control': 'public, max-age=31536000' })
  res.end(o.bytes)
  return true
}

export function handleBrands({ table, req, url, raw, payload, json, res, wantsObject, returnsRows }) {
  const bucket = bucketOf(url.pathname, '/storage/v1/object/')
  if (bucket && req.method === 'POST') {
    const { objects, layout, max, types } = BUCKETS[bucket]
    const name = decodeURIComponent(url.pathname.slice(`/storage/v1/object/${bucket}/`.length))
    if (!layout.test(name) || name.includes('..')) return storageFail(res, 403, 'Unauthorized', 'new row violates row-level security policy')
    const part = filePart(raw, req.headers['content-type'])
    if (!part) return storageFail(res, 400, 'Bad Request', 'invalid multipart body')
    if (!types.includes(part.type)) return storageFail(res, 415, 'Invalid Mime Type', `mime type ${part.type} is not supported`)
    if (part.bytes.length > max) return storageFail(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size')
    if (objects.has(name)) return storageFail(res, 409, 'Duplicate', 'The resource already exists')
    objects.set(name, part)
    json(200, { Key: `${bucket}/${name}`, Id: randomUUID() })
    return true
  }
  if (bucket && req.method === 'DELETE' && url.pathname === `/storage/v1/object/${bucket}`) {
    json(200, (payload?.prefixes ?? []).filter((p) => BUCKETS[bucket].objects.delete(p)).map((name) => ({ name })))
    return true
  }
  if (table === 'categories') {
    if (req.method === 'GET') return (json(200, [...categories].sort((a, b) => a.name.localeCompare(b.name))), true)
    if (req.method === 'POST') {
      if (categories.some((c) => c.name.toLowerCase() === String(payload.name).toLowerCase()))
        return (json(409, { code: '23505', message: 'duplicate key value violates unique constraint "categories_name_key"', details: null, hint: null }), true)
      const row = { id: randomUUID(), is_active: true, image_path: null, ...payload }
      categories.push(row)
      if (!returnsRows) return (res.writeHead(201).end(), true)
      json(201, wantsObject ? row : [row])
      return true
    }
    if (req.method === 'PATCH') {
      const id = url.searchParams.get('id')?.slice(3)
      const hit = categories.filter((c) => c.id === id)
      if (payload && 'image_path' in payload && payload.image_path !== null && !BUCKETS['category-images'].layout.test(payload.image_path))
        return (json(400, { code: '23514', message: 'new row for relation "categories" violates check constraint "categories_image_path_layout"', details: null, hint: null }), true)
      hit.forEach((c) => Object.assign(c, payload))
      if (!returnsRows) return (res.writeHead(204).end(), true)
      json(200, hit)
      return true
    }
  }
  if (table !== 'brands') return false

  if (req.method === 'GET') {
    json(200, [...brands].sort((a, b) => a.name.localeCompare(b.name)))
    return true
  }
  if (req.method === 'POST') {
    if (brands.some((b) => b.name.toLowerCase() === String(payload.name).toLowerCase()))
      return (json(409, { code: '23505', message: 'duplicate key value violates unique constraint "brands_name_key"', details: null, hint: null }), true)
    const row = { id: randomUUID(), is_active: true, logo_path: null, ...payload }
    brands.push(row)
    if (!returnsRows) return (res.writeHead(201).end(), true)
    if (wantsObject) return (json(201, row), true)
    json(201, [row])
    return true
  }
  if (req.method === 'PATCH') {
    const id = url.searchParams.get('id')?.slice(3)
    const hit = brands.filter((b) => b.id === id)
    if (payload && 'logo_path' in payload && payload.logo_path !== null && !BUCKETS['brand-logos'].layout.test(payload.logo_path))
      return (json(400, { code: '23514', message: 'new row for relation "brands" violates check constraint "brands_logo_path_layout"', details: null, hint: null }), true)
    hit.forEach((b) => Object.assign(b, payload))
    if (!returnsRows) return (res.writeHead(204).end(), true)
    json(200, hit)
    return true
  }
  return false
}
