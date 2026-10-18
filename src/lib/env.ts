// Reads and validates the two public settings. A secret key must never reach the browser, so it is refused.

export interface PublicEnv {
  url: string
  key: string
}

function jwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const role = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

export type EnvResult = { ok: true; env: PublicEnv } | { ok: false; problem: string }

export function readEnv(source: Record<string, string | undefined>): EnvResult {
  const url = (source.VITE_SUPABASE_URL ?? '').trim()
  const key = (source.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  if (!url || !key) {
    return {
      ok: false,
      problem: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.',
    }
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) {
    return { ok: false, problem: 'VITE_SUPABASE_URL does not look like a Supabase project URL.' }
  }
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return {
      ok: false,
      problem:
        'A secret / service_role key was supplied. It bypasses all security and must never be used in the browser. ' +
        'Use the publishable key instead and rotate the secret key.',
    }
  }
  return { ok: true, env: { url: url.replace(/\/$/, ''), key } }
}
