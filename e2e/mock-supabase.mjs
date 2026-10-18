// Minimal stand-in for Supabase Auth + PostgREST, ONLY to drive the browser smoke test.
// It is not the real backend and proves nothing about the database.
import http from 'node:http'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const USERS = {
  'admin@example.test': { id: '11111111-1111-1111-1111-111111111111', pw: 'admin-pw', profile: { full_name: 'Asha Admin', role: 'admin' } },
  'manager@example.test': { id: '22222222-2222-2222-2222-222222222222', pw: 'manager-pw', profile: { full_name: 'Mohan Manager', role: 'manager' } },
}
const byId = (id) => Object.values(USERS).find((u) => u.id === id)
const log = []
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
    if (url.pathname === '/__log') return json(200, log)
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
    const sub = (() => { try { return JSON.parse(Buffer.from((req.headers.authorization ?? '').split('.')[1], 'base64url').toString()).sub } catch { return null } })()
    const me = byId(sub)
    if (!me) return json(401, { code: '42501', message: 'permission denied' })
    if (req.method === 'HEAD') return res.writeHead(200, { 'Content-Range': '0-0/5' }).end()
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
    return json(200, [])
  })
})
server.listen(54399, () => console.log('mock supabase on 54399'))
