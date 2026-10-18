import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + detail}`) }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: process.env.CI ? ['--no-sandbox'] : [] })
const consoleErrors = []
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()))
  return page
}
async function login(page, email, pw) {
  await page.goto(BASE + '/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
try {
  // 1. signed-out visitor is sent to login
  let page = await newPage()
  await page.goto(BASE + '/catalogue/products')
  await page.waitForURL('**/login')
  check('signed-out visitor is redirected to /login', await page.getByRole('heading', { name: 'Tirumala Mobiles CRM' }).isVisible())
  await page.screenshot({ path: 'e2e/out/shot-login.png' })

  // 2. wrong password -> friendly message
  await login(page, 'manager@example.test', 'nope')
  await page.getByText('Wrong email or password.').waitFor({ timeout: 5000 })
  check('wrong password shows a friendly message', true)

  // 3. manager
  await page.getByLabel('Password').fill('manager-pw')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByText('Welcome, Mohan Manager').waitFor({ timeout: 5000 })
  check('manager signs in and sees the dashboard', true)
  await page.getByText('Phones in stock').waitFor({ timeout: 5000 })
  check('dashboard shows live counts', (await page.locator('.card-num').first().innerText()) === '5')
  check('manager has no Settings link', (await page.getByRole('link', { name: 'Settings' }).count()) === 0)
  check('manager sees Products link', await page.getByRole('link', { name: 'Products' }).isVisible())
  await page.goto(BASE + '/settings')
  await page.getByText('Not allowed').waitFor({ timeout: 5000 })
  check('manager is blocked from /settings by URL', true)
  await page.getByRole('link', { name: 'Products' }).click()
  await page.getByRole('link', { name: 'Nova X1' }).waitFor({ timeout: 5000 })
  check('products list renders', true)
  await page.screenshot({ path: 'e2e/out/shot-products-manager.png' })
  await page.reload()
  await page.getByRole('link', { name: 'Nova X1' }).waitFor({ timeout: 5000 })
  check('session survives a page reload', true)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL('**/login')
  check('sign out returns to login', true)

  // 4. admin
  await login(page, 'admin@example.test', 'admin-pw')
  await page.getByText('Welcome, Asha Admin').waitFor({ timeout: 5000 })
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('region', { name: 'Manager discount policy' }).waitFor({ timeout: 5000 })
  check('admin sees the discount policy screen', true)
  check('Manager policy is flagged as never reviewed', await page.getByText(/Never reviewed/).first().isVisible())
  check('no approve option is offered for Managers', (await page.getByRole('region', { name: 'Manager discount policy' }).getByLabel(/approve discounts for others/).count()) === 0)
  await page.screenshot({ path: 'e2e/out/shot-settings-admin.png' })
  await page.getByRole('tab', { name: 'Staff' }).click()
  await page.getByText('Mohan Manager').waitFor({ timeout: 5000 })
  check('admin sees the staff list', true)

  // 5. mobile layout does not overflow horizontally
  await page.setViewportSize({ width: 390, height: 800 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('no horizontal page scroll at phone width', overflow <= 1, `overflow=${overflow}px`)
  check('no uncaught browser errors', consoleErrors.length === 0, consoleErrors.join(' | '))
} catch (e) {
  check('smoke test ran to completion', false, String(e).split('\n')[0])
}
await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\nbrowser smoke: ${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
