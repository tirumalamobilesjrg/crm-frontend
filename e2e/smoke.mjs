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
  // 3b. purchasing screens (manager) against the stand-in server
  const MOCK = 'http://127.0.0.1:54399'
  const luhnImei = (p14) => {
    let sum = 0
    for (let i = 0; i < 14; i++) { let d = Number(p14[13 - i]); if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 } sum += d }
    return p14 + String((10 - (sum % 10)) % 10)
  }
  const IMEI_A = luhnImei('49015420323751')
  check('smoke helper builds a valid IMEI (matches a known good one)', IMEI_A === '490154203237518', IMEI_A)
  const IMEI_B = luhnImei('86000000000001')
  const IN_STOCK = '356938035643809' // the stand-in treats this IMEI as already received
  const rpcCalls = async () => (await (await fetch(MOCK + '/__rpc')).json())
  const waitForRpcCalls = async (n) => { for (let i = 0; i < 40; i++) { if ((await rpcCalls()).length >= n) return; await new Promise((r) => setTimeout(r, 100)) } }
  const dialogs = []
  let acceptDialogs = false
  page.on('dialog', async (d) => { dialogs.push(d.message()); await (acceptDialogs ? d.accept() : d.dismiss()) })
  const unit = (n) => page.getByLabel(new RegExp(`phone ${n} of 2`))

  await page.getByRole('link', { name: 'Suppliers' }).click()
  await page.getByRole('heading', { name: 'Suppliers' }).waitFor({ timeout: 5000 })
  await page.getByText('Metro Traders').waitFor({ timeout: 5000 })
  check('suppliers list shows the existing supplier', await page.getByText('Metro Traders').isVisible())
  await page.getByRole('button', { name: 'New supplier' }).click()
  await page.getByRole('button', { name: 'Add supplier' }).click()
  check('supplier form validates a missing name', await page.getByText('Enter the supplier name').isVisible())
  await page.getByLabel('Supplier name').fill('metro traders')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByText('A supplier with this name already exists.').first().waitFor({ timeout: 5000 })
  check('duplicate supplier name shows a friendly message with no database text', (await page.getByText(/constraint|violates|lower\(/i).count()) === 0)
  await page.getByLabel('Supplier name').fill('Delhi Mobiles')
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await page.getByRole('cell', { name: 'Delhi Mobiles' }).waitFor({ timeout: 5000 })
  check('a new supplier appears in the list', true)

  await page.getByRole('link', { name: 'Purchases' }).click()
  await page.getByText('Loading…').waitFor({ timeout: 3000 })
  check('purchases list shows a loading state', true)
  await page.getByText('No purchases yet.').waitFor({ timeout: 5000 })
  check('purchases list shows an empty state', true)

  const createDraft = async (invoice) => {
    await page.getByRole('button', { name: 'New purchase' }).click()
    await page.getByLabel('Supplier', { exact: true }).selectOption({ label: 'Metro Traders' })
    await page.getByLabel('Supplier invoice number').fill(invoice)
    await page.getByRole('button', { name: 'Create draft' }).click()
    await page.getByRole('heading', { name: `Invoice ${invoice}` }).waitFor({ timeout: 5000 })
  }
  const addLine = async (variantId, qty, cost) => {
    await page.getByLabel('Variant').selectOption(variantId)
    await page.getByLabel('Quantity').fill(qty)
    await page.getByLabel('Unit cost (₹)').fill(cost)
    await page.getByRole('button', { name: 'Add line' }).click()
  }

  await page.getByRole('button', { name: 'New purchase' }).click()
  await page.getByRole('button', { name: 'Create draft' }).click()
  check('purchase form validates supplier and invoice number', (await page.getByText('Choose a supplier.').isVisible()) && (await page.getByText('Enter the supplier invoice number').isVisible()))
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await createDraft('INV-100')
  check('creating a purchase opens its draft', await page.getByText('Draft', { exact: true }).first().isVisible())

  await page.getByRole('button', { name: 'Add line' }).click()
  check('line form validates a missing variant and cost', (await page.getByText('Choose a variant.').isVisible()) && (await page.getByText(/Enter the cost per unit/).isVisible()))
  await addLine('v-phone', '2', '15,000')
  await page.getByRole('cell', { name: /NOVA-X1-8-128/ }).first().waitFor({ timeout: 5000 })
  await addLine('v-case', '10', '200')
  await page.getByRole('cell', { name: /NOVA-CASE/ }).first().waitFor({ timeout: 5000 })
  check('line totals add up (2 x 15,000 + 10 x 200)', await page.getByText('₹32,000.00').first().isVisible())
  check('accessories get no IMEI box; phones get one box each', (await page.getByPlaceholder(/Scan or type/).count()) === 2)

  await page.getByRole('button', { name: 'Receive stock' }).click()
  await page.getByText('Fill in every IMEI or serial number').first().waitFor({ timeout: 5000 })
  check('receiving with empty boxes is blocked, with no confirmation dialog', dialogs.length === 0 && (await page.getByText('Required').count()) === 2)
  await unit(1).fill('490154203237519')
  check('a wrong IMEI check digit is flagged', await page.getByText(/check digit/).isVisible())
  await unit(1).fill(IMEI_A)
  await unit(1).press('Enter')
  check('Enter moves to the next IMEI box', (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).includes('phone 2 of 2'))
  await unit(2).fill(IMEI_A)
  check('a duplicate IMEI is flagged on both boxes', (await page.getByText('Duplicate: entered more than once').count()) === 2)
  await unit(2).fill(IN_STOCK)
  await page.getByRole('button', { name: 'Receive stock' }).click()
  await page.waitForTimeout(300)
  check('the receiving confirmation appears and cancelling it sends nothing', dialogs.length === 1 && /Receive 2 phone\(s\) and 10 accessory unit\(s\)/.test(dialogs[0]) && (await rpcCalls()).length === 0, dialogs.join('|'))

  acceptDialogs = true
  await page.getByRole('button', { name: 'Receive stock' }).click()
  await page.getByText(`IMEI ${IN_STOCK} is already recorded on another device.`).first().waitFor({ timeout: 5000 })
  check('a duplicate IMEI already in stock shows a friendly server error', (await page.getByText(/constraint|violates|inventory_items/i).count()) === 0)
  await page.getByRole('button', { name: 'Receive stock' }).click()
  await waitForRpcCalls(2)
  let calls = await rpcCalls()
  check('retrying the same units reuses the same idempotency key', calls.length === 2 && calls[0].key === calls[1].key && calls[0].key.length >= 8, `calls=${calls.length}`)
  await unit(2).fill(IMEI_B)
  await page.getByRole('button', { name: 'Receive stock' }).click()
  await page.getByText('Stock received: 2 phone(s) and 10 accessory unit(s).').waitFor({ timeout: 5000 })
  calls = await rpcCalls()
  check('changed units use a new key and the receipt succeeds', calls.length === 3 && calls[2].key !== calls[0].key && calls[2].units.length === 2, `calls=${calls.length}`)
  check('a received purchase shows Received and offers no further actions', (await page.locator('.badge', { hasText: 'Received' }).count()) > 0 && (await page.getByRole('button', { name: /Receive stock|Remove|Cancel purchase|Add line/ }).count()) === 0)

  // stale page: someone else finalises the purchase while this page is still showing it as a draft
  await page.getByRole('link', { name: '← Purchases' }).click()
  await createDraft('INV-101')
  await addLine('v-phone', '1', '15,000')
  await page.getByRole('cell', { name: /NOVA-X1-8-128/ }).first().waitFor({ timeout: 5000 })
  await fetch(`${MOCK}/__set_status?invoice=INV-101&status=received`)
  await page.getByRole('button', { name: /Remove line/ }).click()
  await page.getByText(/That change was not applied/).first().waitFor({ timeout: 5000 })
  check('removing a line of a finalised purchase fails visibly instead of pretending to succeed', await page.getByRole('cell', { name: /NOVA-X1-8-128/ }).first().isVisible())
  await page.getByRole('link', { name: '← Purchases' }).click()
  await createDraft('INV-102')
  await addLine('v-case', '3', '200')
  await page.getByRole('cell', { name: /NOVA-CASE/ }).first().waitFor({ timeout: 5000 })
  await fetch(`${MOCK}/__set_status?invoice=INV-102&status=received`)
  await page.getByRole('button', { name: 'Cancel purchase' }).click()
  await page.getByText(/That change was not applied/).first().waitFor({ timeout: 5000 })
  check('cancelling a finalised purchase fails visibly and never shows "cancelled"', (await page.getByText('Purchase cancelled').count()) === 0)
  await page.screenshot({ path: 'e2e/out/shot-purchase-stale.png' })

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
  await page.goto(BASE + '/purchasing/purchases')
  await page.getByRole('link', { name: 'INV-100' }).click()
  await page.getByRole('heading', { name: 'Invoice INV-100' }).waitFor({ timeout: 5000 })
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('no horizontal page scroll on a purchase at phone width', overflow2 <= 1, `overflow=${overflow2}px`)
  check('no uncaught browser errors', consoleErrors.length === 0, consoleErrors.join(' | '))
} catch (e) {
  check('smoke test ran to completion', false, String(e).split('\n')[0])
}
await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\nbrowser smoke: ${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
