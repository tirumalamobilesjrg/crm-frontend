import { describe, expect, it } from 'vitest'
import { AppError, toAppError } from './errors'

describe('toAppError', () => {
  it('maps permission errors', () => {
    expect(toAppError({ code: '42501', message: 'permission denied for table x' }).message).toMatch(/permission/i)
  })
  it('explains duplicates using the key from the details', () => {
    const e = toAppError({ code: '23505', details: 'Key (sku)=(NOVA-1) already exists.' })
    expect(e.message).toContain('sku')
    expect(e.message).toContain('NOVA-1')
  })
  it('shows the server wording for validation errors (TM003)', () => {
    expect(toAppError({ code: 'TM003', message: 'a discount reason is required' }).message).toBe('a discount reason is required')
  })
  it('gives a clear message for discount and payment rules', () => {
    expect(toAppError({ code: 'TM005' }).message).toMatch(/discount/i)
    expect(toAppError({ code: 'TM006' }).message).toMatch(/payment/i)
    expect(toAppError({ code: 'TM011' }).message).toMatch(/last active Admin/)
  })
  it('maps the error shape supabase-js really throws (code, not error_code)', () => {
    const e = toAppError({ name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' })
    expect(e.message).toBe('Wrong email or password.')
  })
  it('maps auth errors', () => {
    expect(toAppError({ error_code: 'invalid_credentials', message: 'Invalid login credentials' }).message).toBe('Wrong email or password.')
  })
  it('recognises network failures', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('network')
  })
  it('passes AppError through and has a fallback', () => {
    const a = new AppError('x')
    expect(toAppError(a)).toBe(a)
    expect(toAppError(null).message).toMatch(/went wrong/)
  })
})
