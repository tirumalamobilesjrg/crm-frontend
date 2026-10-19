// Builds the app against a stand-in Supabase (e2e/mock-supabase.mjs), serves it, and drives it in a real browser.
// The stand-in is NOT the real backend: this checks the UI, routing, role gating and the Supabase client usage only.
// One-time setup: npx playwright-core install chromium   (or set CHROME_PATH to an installed Chrome/Chromium)
import { spawn } from 'node:child_process'

const OUT = '.smoke-dist'
const MOCK_PORT = process.env.SMOKE_MOCK_PORT ?? '54399'
const env = { ...process.env, SMOKE_MOCK_PORT: MOCK_PORT, VITE_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_smoketest' }
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const run = (cmd, args, opts = {}) => spawn(cmd, args, { stdio: 'inherit', env, shell: cmd.endsWith('.cmd'), ...opts })
const wait = (child) => new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)))

const build = await wait(run(npx, ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn']))
if (build !== 0) process.exit(build)

// The preview server is started with node directly: killing an npx.cmd wrapper on Windows would leave the real server running.
const children = [
  run(process.execPath, ['e2e/mock-supabase.mjs'], { stdio: 'ignore' }),
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'e2e/vite.preview.config.mjs', '--outDir', OUT, '--port', '4173', '--host', '127.0.0.1'], { stdio: 'ignore' }),
]
for (let i = 0; i < 40; i++) {
  try { if ((await fetch('http://127.0.0.1:4173/')).ok) break } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250))
}
// `npm run smoke` runs the checks; `npm run screenshots` runs the same stand-in server with e2e/screenshots.mjs
const scriptAt = process.argv.indexOf('--script')
const script = scriptAt >= 0 ? process.argv[scriptAt + 1] : 'e2e/smoke.mjs'
const code = await wait(run(process.execPath, [script]))
children.forEach((c) => c.kill())
process.exit(code)
