import { parseRupees, toPaise } from '../../lib/money'
import type { PaymentMethod } from '../../lib/types'
import type { ExpenseInput } from '../../api/expenses'

export const EXPENSE_CATEGORIES = [
  'Rent', 'Salaries', 'Electricity', 'Internet and phone', 'Transport', 'Repairs and maintenance', 'Marketing', 'Packaging', 'Tea and refreshments', 'Miscellaneous',
]

export interface ExpenseForm {
  date: string
  category: string
  description: string
  amount: string
  paidVia: PaymentMethod | ''
}

export type ExpenseErrors = Partial<Record<keyof ExpenseForm, string>>

/** `today` is the shop's local date (YYYY-MM-DD); an expense cannot be dated in the future. */
export function validateExpense(f: ExpenseForm, today: string): { errors: ExpenseErrors; value: ExpenseInput | null } {
  const errors: ExpenseErrors = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.date = 'Choose the date of the expense.'
  else if (f.date > today) errors.date = 'The date cannot be in the future.'
  const category = f.category.trim()
  if (category.length < 1 || category.length > 80) errors.category = 'Enter a category (up to 80 characters).'
  const amount = parseRupees(f.amount)
  if (amount === null || amount <= 0) errors.amount = 'Enter the amount in rupees (more than 0, at most 2 decimals).'
  if (!f.paidVia) errors.paidVia = 'Choose how it was paid.'
  if (f.description.length > 300) errors.description = 'Keep the description under 300 characters.'
  if (Object.keys(errors).length > 0 || amount === null || !f.paidVia) return { errors, value: null }
  return { errors, value: { expense_date: f.date, category, description: f.description.trim() === '' ? null : f.description.trim(), amount, paid_via: f.paidVia } }
}

export interface ExpenseSummary {
  totalPaise: number
  count: number
  byCategory: Array<{ category: string; totalPaise: number; count: number }>
}

/** Totals in integer paise, categories sorted by amount (largest first). */
export function summarizeExpenses(rows: Array<{ amount: number; category: string }>): ExpenseSummary {
  const by = new Map<string, { totalPaise: number; count: number }>()
  let total = 0
  for (const r of rows) {
    const p = toPaise(r.amount)
    total += p
    const cur = by.get(r.category) ?? { totalPaise: 0, count: 0 }
    by.set(r.category, { totalPaise: cur.totalPaise + p, count: cur.count + 1 })
  }
  return {
    totalPaise: total,
    count: rows.length,
    byCategory: [...by.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.totalPaise - a.totalPaise || a.category.localeCompare(b.category)),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthStart = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
