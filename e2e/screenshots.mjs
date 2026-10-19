// Captures the key screens (desktop light, desktop dark, phone) against the stand-in server for visual review.
import { handleConfirmDialogs } from './confirm-handler.mjs'
// Run: npm run screenshots   (output: e2e/out/ui-*.png). Not a test: nothing here asserts.
import { chromium } from 'playwright-core'

const BASE = 'http://127.0.0.1:4173'
const luhnImei = (p14) => {
  let sum = 0
  for (let i = 0; i < 14; i++) { let d = Number(p14[13 - i]); if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 } sum += d }
  return p14 + String((10 - (sum % 10)) % 10)
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: process.env.CI ? ['--no-sandbox'] : [] })
const shot = (page, name, full = false) => page.screenshot({ path: `e2e/out/ui-${name}.png`, fullPage: full })
const settle = (page) => page.waitForTimeout(450)

async function session(viewport, scheme = 'light') {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme })
  const page = await ctx.newPage()
  return page
}
async function login(page) {
  await page.goto(BASE + '/')
  await page.getByLabel('Email').fill('manager@example.test')
  await page.getByLabel('Password').fill('manager-pw')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: /Welcome/ }).waitFor({ timeout: 8000 })
}
async function sell(page, imei, method = 'cash', discount = '') {
  await page.goto(BASE + '/pos')
  await page.getByLabel('Scan IMEI or serial number').fill(imei)
  await page.getByLabel('Scan IMEI or serial number').press('Enter')
  await page.getByRole('table', { name: 'Sale lines' }).waitFor({ timeout: 8000 })
  if (discount) await page.getByLabel(/Discount for/).fill(discount)
  await page.getByLabel('Paid by').selectOption(method)
}

try {
  // ---- desktop, light
  let page = await session({ width: 1360, height: 860 })
  await page.goto(BASE + '/login')
  await settle(page)
  await shot(page, 'desktop-login')
  await login(page)
  await handleConfirmDialogs(page, { decide: () => true })
  // two sales so the dashboard has real figures
  await sell(page, luhnImei('87000000000001'))
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('heading', { name: /Invoice TM/ }).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'desktop-invoice', true)
  await sell(page, luhnImei('87000000000002'), 'upi')
  await page.getByLabel('Accessory').selectOption('v-case')
  await page.getByRole('button', { name: 'Add accessory' }).click()
  await settle(page)
  await shot(page, 'desktop-pos-cart', true)
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('heading', { name: /Invoice TM/ }).waitFor({ timeout: 8000 })
  await page.goto(BASE + '/')
  await page.getByRole('region', { name: 'Today at the counter' }).getByText(/sales today/).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'desktop-dashboard', true)
  await page.goto(BASE + '/inventory')
  await page.getByRole('table', { name: 'Devices' }).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'desktop-inventory')
  await page.goto(BASE + '/reports')
  await page.getByLabel('Sales summary').getByRole('img', { name: /Net sales per day/ }).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'desktop-reports', true)
  await page.goto(BASE + '/catalogue/products/p1')
  await page.getByRole('heading', { name: 'Nova X1' }).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'desktop-product', true)
  await page.goto(BASE + '/customers')
  await page.getByRole('heading', { name: 'Customers' }).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'desktop-customers')
  await page.getByRole('button', { name: 'New customer' }).click()
  await settle(page)
  await shot(page, 'desktop-dialog')
  // ---- dark
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/')
  await page.getByRole('region', { name: 'Today at the counter' }).waitFor({ timeout: 8000 })
  await page.getByRole('button', { name: /Colour theme/ }).click() // match device -> light
  await page.getByRole('button', { name: /Colour theme/ }).click() // -> dark
  await settle(page)
  await shot(page, 'dark-dashboard', true)
  await page.goto(BASE + '/pos')
  await page.getByLabel('Scan IMEI or serial number').fill(luhnImei('87000000000003'))
  await page.getByLabel('Scan IMEI or serial number').press('Enter')
  await page.getByRole('table', { name: 'Sale lines' }).waitFor({ timeout: 8000 })
  await page.getByLabel(/Discount for/).fill('1000')
  await settle(page)
  await shot(page, 'dark-pos-discount', true)
  await page.context().close()

  // ---- phone
  page = await session({ width: 390, height: 844 })
  await handleConfirmDialogs(page, { decide: () => true })
  await page.goto(BASE + '/login')
  await settle(page)
  await shot(page, 'phone-login', true)
  await login(page)
  await settle(page)
  await shot(page, 'phone-dashboard', true)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await settle(page)
  await shot(page, 'phone-drawer')
  await page.getByRole('link', { name: 'Inventory' }).click()
  await page.getByRole('table', { name: 'Devices' }).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'phone-inventory')
  await page.goto(BASE + '/pos')
  await page.getByLabel('Scan IMEI or serial number').fill(luhnImei('87000000000004'))
  await page.getByLabel('Scan IMEI or serial number').press('Enter')
  await page.getByRole('table', { name: 'Sale lines' }).waitFor({ timeout: 8000 })
  await settle(page)
  await shot(page, 'phone-pos', true)
  console.log('screenshots written to e2e/out/ui-*.png')
} finally {
  await browser.close()
}
