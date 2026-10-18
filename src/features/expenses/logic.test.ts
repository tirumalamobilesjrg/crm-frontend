import { describe, expect, it } from 'vitest'
import { isoDate, monthStart, summarizeExpenses, validateExpense } from './logic'
import { validateCustomerEdit } from '../customers/logic'

const good = { date: '2026-10-18', category: ' Rent ', description: ' October ', amount: '25,000', paidVia: 'bank_transfer' as const }

describe('validateExpense', () => {
  it('parses a valid expense', () => {
    expect(validateExpense(good, '2026-10-18')).toEqual({ errors: {}, value: { expense_date: '2026-10-18', category: 'Rent', description: 'October', amount: 25000, paid_via: 'bank_transfer' } })
  })
  it('an empty description becomes null', () => {
    expect(validateExpense({ ...good, description: '  ' }, '2026-10-18').value?.description).toBeNull()
  })
  it('refuses a future date, a bad date, and accepts today', () => {
    expect(validateExpense({ ...good, date: '2026-10-19' }, '2026-10-18').errors.date).toMatch(/future/)
    expect(validateExpense({ ...good, date: '' }, '2026-10-18').errors.date).toBeDefined()
    expect(validateExpense({ ...good, date: '2026-10-18' }, '2026-10-18').errors.date).toBeUndefined()
  })
  it('refuses zero, negative, sub-paisa and non-numeric amounts', () => {
    for (const a of ['0', '-5', '10.005', 'abc', '']) expect(validateExpense({ ...good, amount: a }, '2026-10-18').errors.amount).toBeDefined()
    expect(validateExpense({ ...good, amount: '0.01' }, '2026-10-18').errors.amount).toBeUndefined()
  })
  it('needs a category (max 80), a payment method and a short description', () => {
    expect(validateExpense({ ...good, category: ' ' }, '2026-10-18').errors.category).toBeDefined()
    expect(validateExpense({ ...good, category: 'x'.repeat(81) }, '2026-10-18').errors.category).toBeDefined()
    expect(validateExpense({ ...good, paidVia: '' }, '2026-10-18').errors.paidVia).toBeDefined()
    expect(validateExpense({ ...good, description: 'x'.repeat(301) }, '2026-10-18').errors.description).toBeDefined()
  })
})

describe('summarizeExpenses', () => {
  it('totals in paise and sorts categories by amount', () => {
    const s = summarizeExpenses([{ amount: 0.1, category: 'Tea' }, { amount: 0.2, category: 'Tea' }, { amount: 25000, category: 'Rent' }, { amount: 1830.5, category: 'Electricity' }])
    expect(s.totalPaise).toBe(2_683_080)
    expect(s.count).toBe(4)
    expect(s.byCategory.map((c) => [c.category, c.totalPaise, c.count])).toEqual([['Rent', 2_500_000, 1], ['Electricity', 183_050, 1], ['Tea', 30, 2]])
  })
  it('an empty list is zero', () => {
    expect(summarizeExpenses([])).toEqual({ totalPaise: 0, count: 0, byCategory: [] })
  })
  it('date helpers', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(monthStart(new Date(2026, 9, 18))).toBe('2026-10-01')
  })
})

describe('validateCustomerEdit', () => {
  it('adds notes to the quick-add rules', () => {
    expect(validateCustomerEdit({ name: ' Ravi ', phone: '98765 43210', email: '', address: '', notes: ' VIP ' }).value).toEqual({ name: 'Ravi', phone: '9876543210', email: null, address: null, notes: 'VIP' })
    expect(validateCustomerEdit({ name: '', phone: '12', email: 'x', address: '', notes: 'x'.repeat(501) }).errors).toEqual({ name: expect.any(String), phone: expect.any(String), email: expect.any(String), notes: expect.any(String) })
  })
})
