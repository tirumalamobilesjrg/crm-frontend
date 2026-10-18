import { describe, expect, it } from 'vitest'
import { readEnv } from './env'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`
const URL = 'https://abcdefghijklmnopqrst.supabase.co'

describe('readEnv', () => {
  it('accepts a project URL with a publishable key', () => {
    const r = readEnv({ VITE_SUPABASE_URL: URL + '/', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })
    expect(r).toEqual({ ok: true, env: { url: URL, key: 'sb_publishable_abc' } })
  })
  it('accepts a legacy anon JWT', () => {
    expect(readEnv({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).ok).toBe(true)
  })
  it('accepts a local development URL', () => {
    expect(readEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).ok).toBe(true)
  })
  it('reports missing values', () => {
    const r = readEnv({})
    expect(r.ok).toBe(false)
    expect(!r.ok && r.problem).toMatch(/Missing/)
  })
  it('refuses a secret key', () => {
    const r = readEnv({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.problem).toMatch(/secret/i)
  })
  it('refuses a service_role JWT', () => {
    const r = readEnv({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })
    expect(r.ok).toBe(false)
  })
  it('refuses a URL that is not Supabase', () => {
    expect(readEnv({ VITE_SUPABASE_URL: 'https://evil.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).ok).toBe(false)
  })
})
