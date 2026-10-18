// Builds the app against a stand-in Supabase (e2e/mock-supabase.mjs), serves it, and drives it in a real browser.
// The stand-in is NOT the real backend: this checks the UI, routing, role gating and the Supabase client usage only.
// One-time setup: npx playwright-core install chromium   (or set CHROME_PATH to an installed Chrome/Chromium)
import { spawn } from 'node:child_process'

const OUT = '.smoke-dist'
const env = { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:54399', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_smoketest' }
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const run = (cmd, args, opts = {}) => spawn(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32', ...opts })
const wait = (child) => new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)))

const build = await wait(run(npx, ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn']))
if (build !== 0) process.exit(build)

const children = [run(process.execPath, ['e2e/mock-supabase.mjs'], { stdio: 'ignore' }), run(npx, ['vite', 'preview', '--outDir', OUT, '--port', '4173', '--host', '127.0.0.1'], { stdio: 'ignore' })]
for (let i = 0; i < 40; i++) {
  try { if ((await fetch('http://127.0.0.1:4173/')).ok) break } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250))
}
const code = await wait(run(process.execPath, ['e2e/smoke.mjs']))
children.forEach((c) => c.kill())
process.exit(code)
