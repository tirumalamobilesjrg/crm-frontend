// Automated accessibility audit: runs axe-core on every screen as manager and admin, at phone and desktop width, light and dark.
// Run: npm run a11y   (builds, serves with the production CSP vs the stand-in Supabase). Exits 1 on any serious/critical violation.
// Automated checks cover roughly a third of WCAG; a real-phone/screen-reader pass is still needed.
import { readFileSync } from 'node:fs'
import { handleConfirmDialogs } from './confirm-handler.mjs'
import { chromium } from 'playwright-core'

const BASE = 'http://127.0.0.1:4173'
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: process.env.CI ? ['--no-sandbox'] : [] })

const SHARED = [
  '/', '/pos', '/sales', '/customers', '/inventory', '/purchasing/suppliers', '/purchasing/purchases',
  '/catalogue/products', '/catalogue/setup', '/expenses', '/reports',
]
const ADMIN_ONLY = ['/approvals', '/audit', '/settings']
// Detail pages are reached by following the first matching link from a list page.
const DETAILS = [
  ['/sales', 'a[href^="/sales/"]'], ['/customers', 'a[href^="/customers/"]'],
  ['/inventory', 'a[href^="/inventory/devices/"]'], ['/purchasing/purchases', 'a[href^="/purchasing/purchases/"]'],
  ['/catalogue/products', 'a[href^="/catalogue/products/"]'],
]

const results = [] // { page, rule, impact, nodes: [target...] , help }
async function login(page, email, pw) {
  await page.goto(BASE + '/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: /Welcome/ }).waitFor({ timeout: 8000 })
}
async function audit(page, label) {
  await page.waitForTimeout(350)
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(axeSource)
  const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
  for (const v of r.violations) results.push({ page: label, rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) })
}
async function visit(page, path, label) {
  await page.goto(BASE + path)
  await page.waitForTimeout(300)
  await audit(page, label)
}

const luhnImei = (p14) => {
  let sum = 0
  for (let i = 0; i < 14; i++) { let d = Number(p14[13 - i]); if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 } sum += d }
  return p14 + String((10 - (sum % 10)) % 10)
}
// Seed one sale, customer and draft purchase so list and detail screens have rows (the stand-in keeps them in memory).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await login(page, 'manager@example.test', 'manager-pw')
  await handleConfirmDialogs(page, { decide: () => true })
  await page.goto(BASE + '/customers')
  await page.getByRole('button', { name: 'New customer' }).click()
  await page.getByLabel('Name').fill('Ravi Kumar')
  await page.getByLabel('Phone').fill('9876543210')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: 'Ravi Kumar' }).waitFor({ timeout: 5000 })
  await page.goto(BASE + '/purchasing/purchases')
  await page.getByRole('button', { name: 'New purchase' }).click()
  await page.getByLabel('Supplier', { exact: true }).selectOption({ label: 'Metro Traders' })
  await page.getByLabel('Supplier invoice number').fill('INV-1')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await page.getByRole('heading', { name: 'Invoice INV-1' }).waitFor({ timeout: 5000 })
  await page.goto(BASE + '/pos')
  await page.getByLabel('Scan IMEI or serial number').fill(luhnImei('87000000000001'))
  await page.getByLabel('Scan IMEI or serial number').press('Enter')
  await page.getByRole('table', { name: 'Sale lines' }).waitFor({ timeout: 8000 })
  await page.getByLabel('Paid by').selectOption('cash')
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('heading', { name: /Invoice TM/ }).waitFor({ timeout: 8000 })
  await ctx.close()
}

for (const [who, email, pw] of [['manager', 'manager@example.test', 'manager-pw'], ['admin', 'admin@example.test', 'admin-pw']]) {
  for (const [vw, size] of [['phone', { width: 375, height: 812 }], ['desktop', { width: 1280, height: 800 }]]) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: size, colorScheme: theme })
      await ctx.addInitScript((t) => { try { localStorage.setItem('crm-theme', t) } catch { /* ignore */ } }, theme)
      const page = await ctx.newPage()
      const tag = `${who}/${vw}/${theme}`
      await page.goto(BASE + '/login')
      await page.waitForTimeout(300)
      await audit(page, `${tag} /login`)
      await login(page, email, pw)
      for (const p of who === 'admin' ? [...SHARED, ...ADMIN_ONLY] : SHARED) await visit(page, p, `${tag} ${p}`)
      for (const [list, sel] of DETAILS) {
        await page.goto(BASE + list)
        await page.waitForTimeout(400)
        const href = await page.locator(sel).first().getAttribute('href').catch(() => null)
        if (href) await visit(page, href, `${tag} ${href.replace(/[0-9a-f-]{20,}/g, ':id')}`)
        else console.log(`no detail link on ${list} (${tag})`)
      }
      if (who === 'admin') {
        await page.goto(BASE + '/settings')
        for (const name of ['Shop details', 'Staff']) {
          await page.getByRole('tab', { name: new RegExp(name) }).click()
          await audit(page, `${tag} /settings [${name}]`)
        }
      }
      // phone: the open navigation drawer
      if (vw === 'phone') {
        await page.goto(BASE + '/')
        await page.getByRole('button', { name: 'Open menu' }).click()
        await audit(page, `${tag} drawer`)
      }
      await ctx.close()
    }
  }
}
await browser.close()

// Group by rule, merging identical findings across pages.
const byRule = new Map()
for (const r of results) {
  const g = byRule.get(r.rule) ?? { impact: r.impact, help: r.help, pages: new Map() }
  const nodes = g.pages.get(r.page) ?? []
  nodes.push(...r.nodes)
  g.pages.set(r.page, nodes)
  byRule.set(r.rule, g)
}
let bad = 0
for (const [rule, g] of byRule) {
  const total = [...g.pages.values()].reduce((n, a) => n + a.length, 0)
  console.log(`\n[${g.impact}] ${rule}: ${g.help}  (${total} nodes on ${g.pages.size} page views)`)
  const seen = new Set()
  for (const [pg, nodes] of g.pages) for (const n of nodes) { if (!seen.has(n) && seen.size < 12) { seen.add(n); console.log(`   ${pg}  ->  ${n}`) } }
  if (g.impact === 'serious' || g.impact === 'critical') bad += total
}
console.log(`\n${byRule.size} rule(s) violated, ${bad} serious/critical node(s).`)
process.exit(bad > 0 ? 1 : 0)
