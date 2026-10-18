import { supabase } from '../lib/supabase'
import { toAppError } from '../lib/errors'
import type { Expense, PaymentMethod } from '../lib/types'
import { fetchAll, run, runChange } from './db'
import { PAGE_SIZE } from './inventory'

// Both roles may record and edit expenses; only an Admin may delete one (RLS). Receipts/attachments are not supported:
// the backend defines no Storage policies yet.

const COLUMNS = 'id, expense_date, category, description, amount, paid_via, created_at'

export interface ExpenseFilter {
  from: string
  to: string
  category: string
}

export interface ExpenseInput {
  expense_date: string
  category: string
  description: string | null
  amount: number
  paid_via: PaymentMethod
}

export async function listExpenses(f: ExpenseFilter & { page: number }): Promise<{ rows: Expense[]; total: number }> {
  const from = (f.page - 1) * PAGE_SIZE
  let q = supabase.from('expenses').select(COLUMNS, { count: 'exact' })
  if (f.from) q = q.gte('expense_date', f.from)
  if (f.to) q = q.lte('expense_date', f.to)
  if (f.category) q = q.eq('category', f.category)
  const { data, error, count } = await q.order('expense_date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
  if (error) throw toAppError(error)
  return { rows: (data ?? []) as Expense[], total: count ?? 0 }
}

/** Amount and category of every expense in the filter (all pages), for totals and the breakdown. */
export const listExpenseAmounts = (f: ExpenseFilter) =>
  fetchAll<{ amount: number; category: string }>((from, to) => {
    let q = supabase.from('expenses').select('amount, category')
    if (f.from) q = q.gte('expense_date', f.from)
    if (f.to) q = q.lte('expense_date', f.to)
    if (f.category) q = q.eq('category', f.category)
    return q.order('expense_date').order('id').range(from, to) as never
  })

export const listExpenseCategories = () =>
  run<Array<{ category: string }>>(supabase.from('expenses').select('category').order('category').limit(1000)).then((rows) => [...new Set(rows.map((r) => r.category))])

export const createExpense = (input: ExpenseInput) => run<Expense>(supabase.from('expenses').insert(input).select(COLUMNS).single())

export const updateExpense = (id: string, patch: ExpenseInput) => runChange(supabase.from('expenses').update(patch).eq('id', id).select('id'))

/** Admin only (RLS). */
export const deleteExpense = (id: string) => runChange(supabase.from('expenses').delete().eq('id', id).select('id'))
