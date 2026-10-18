import { describe, expect, it } from 'vitest'
import { validatePolicy, type PolicyForm } from './policyValidation'

const base: PolicyForm = { role: 'manager', can_discount: true, max_percent: '10', max_amount: '', can_approve: false }

describe('validatePolicy', () => {
  it('accepts a normal Manager policy', () => {
    expect(validatePolicy(base)).toEqual({ error: null, value: { role: 'manager', can_discount: true, max_percent: 10, max_amount: null, can_approve: false } })
  })
  it('parses a per-sale cap', () => {
    expect(validatePolicy({ ...base, max_amount: '5,000' }).value?.max_amount).toBe(5000)
  })
  it('requires a zero allowance when discounting is off', () => {
    expect(validatePolicy({ ...base, can_discount: false }).error).toMatch(/switched off/)
    expect(validatePolicy({ ...base, can_discount: false, max_percent: '0' }).error).toBeNull()
  })
  it('rejects out-of-range or malformed percentages', () => {
    for (const p of ['101', '-1', 'abc', '5.555']) expect(validatePolicy({ ...base, max_percent: p }).value).toBeNull()
  })
  it('never lets a Manager approve discounts', () => {
    expect(validatePolicy({ ...base, can_approve: true }).error).toMatch(/Only an Admin/)
  })
  it('lets an Admin approve only while discounting is allowed', () => {
    expect(validatePolicy({ ...base, role: 'admin', can_approve: true }).error).toBeNull()
    expect(validatePolicy({ ...base, role: 'admin', can_discount: false, max_percent: '0', can_approve: true }).error).toMatch(/requires/)
  })
})
