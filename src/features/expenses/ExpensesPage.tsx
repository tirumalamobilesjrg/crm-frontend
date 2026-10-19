import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createExpense, deleteExpense, listExpenseAmounts, listExpenseCategories, listExpenses, updateExpense } from '../../api/expenses'
import { PAGE_SIZE } from '../../api/inventory'
import { useAuth } from '../../auth/AuthProvider'
import { toAppError } from '../../lib/errors'
import { formatINR } from '../../lib/money'
import type { Expense } from '../../lib/types'
import { Button, Dialog, ErrorBox, Field, Loading, Pagination, useConfirm, useToast } from '../../components/ui'
import { PAYMENT_LABEL, PAYMENT_METHODS } from '../pos/logic'
import { EXPENSE_CATEGORIES, isoDate, monthStart, summarizeExpenses, validateExpense, type ExpenseForm } from './logic'

const today = () => isoDate(new Date())

function ExpenseDialog({ expense, categories, onClose }: { expense: Expense | null; categories: string[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<ExpenseForm>(
    expense
      ? { date: expense.expense_date, category: expense.category, description: expense.description ?? '', amount: String(expense.amount), paidVia: expense.paid_via }
      : { date: today(), category: '', description: '', amount: '', paidVia: 'cash' },
  )
  const [errors, setErrors] = useState<ReturnType<typeof validateExpense>['errors']>({})
  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const suggestions = [...new Set([...EXPENSE_CATEGORIES, ...categories])].sort()

  const save = useMutation({
    mutationFn: async (v: NonNullable<ReturnType<typeof validateExpense>['value']>) => {
      if (expense) await updateExpense(expense.id, v)
      else await createExpense(v)
    },
    onSuccess: () => {
      notify(expense ? 'Expense saved' : 'Expense recorded')
      void qc.invalidateQueries({ queryKey: ['expenses'] })
      void qc.invalidateQueries({ queryKey: ['reports'] })
      onClose()
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateExpense(form, today())
    setErrors(found)
    if (value && !save.isPending) save.mutate(value)
  }

  return (
    <Dialog title={expense ? 'Edit expense' : 'New expense'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="grid-2">
          <Field label="Date" error={errors.date}>
            {(p) => <input {...p} type="date" max={today()} value={form.date} onChange={(e) => set('date', e.target.value)} />}
          </Field>
          <Field label="Amount (₹)" error={errors.amount}>
            {(p) => <input {...p} inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} />}
          </Field>
        </div>
        <Field label="Category" error={errors.category} hint="Pick a suggestion or type your own.">
          {(p) => (
            <>
              <input {...p} list="expense-categories" value={form.category} maxLength={80} onChange={(e) => set('category', e.target.value)} />
              <datalist id="expense-categories">
                {suggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Paid via" error={errors.paidVia}>
          {(p) => (
            <select {...p} value={form.paidVia} onChange={(e) => set('paidVia', e.target.value as ExpenseForm['paidVia'])}>
              <option value="">Choose…</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Description (optional)" error={errors.description}>
          {(p) => <textarea {...p} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ExpensesPage() {
  const qc = useQueryClient()
  const { notify } = useToast()
  const confirm = useConfirm()
  const { state } = useAuth()
  const isAdmin = state.status === 'ready' && state.profile.role === 'admin'
  const [params, setParams] = useSearchParams()
  const from = params.get('from') ?? monthStart(new Date())
  const to = params.get('to') ?? today()
  const category = params.get('category') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)

  const filter = { from, to, category }
  const list = useQuery({ queryKey: ['expenses', 'list', { ...filter, page }], queryFn: () => listExpenses({ ...filter, page }), placeholderData: (prev) => prev })
  const amounts = useQuery({ queryKey: ['expenses', 'amounts', filter], queryFn: () => listExpenseAmounts(filter) })
  const categories = useQuery({ queryKey: ['expenses', 'categories'], queryFn: listExpenseCategories, staleTime: 60_000 })
  const summary = summarizeExpenses(amounts.data ?? [])

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }

  const remove = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      notify('Expense deleted')
      void qc.invalidateQueries({ queryKey: ['expenses'] })
      void qc.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  return (
    <div>
      <div className="page-head">
        <h1>Expenses</h1>
        <Button variant="primary" onClick={() => setEditing('new')}>
          New expense
        </Button>
      </div>

      <div className="filters">
        <Field label="From">{(p) => <input {...p} type="date" value={from} max={to} onChange={(e) => update({ from: e.target.value, page: '' })} />}</Field>
        <Field label="To">{(p) => <input {...p} type="date" value={to} min={from} onChange={(e) => update({ to: e.target.value, page: '' })} />}</Field>
        <Field label="Category">
          {(p) => (
            <select {...p} value={category} onChange={(e) => update({ category: e.target.value, page: '' })}>
              <option value="">All categories</option>
              {(categories.data ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <section className="panel" aria-label="Expense totals">
        {amounts.isPending && <Loading label="Totalling…" />}
        {amounts.isError && <ErrorBox error={amounts.error} retry={() => void amounts.refetch()} />}
        {amounts.data && (
          <>
            <p>
              <strong className="big">{formatINR(summary.totalPaise / 100)}</strong> <span className="muted">across {summary.count} {summary.count === 1 ? 'expense' : 'expenses'}</span>
            </p>
            {summary.byCategory.length > 0 && (
              <ul className="breakdown" aria-label="By category">
                {summary.byCategory.map((c) => (
                  <li key={c.category}>
                    <span>{c.category}</span>
                    <span>{formatINR(c.totalPaise / 100)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <>
          <table className="table" aria-label="Expenses">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Paid via</th>
                <th className="right">Amount</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No expenses in this period.
                  </td>
                </tr>
              )}
              {list.data.rows.map((x) => (
                <tr key={x.id}>
                  <td>{x.expense_date}</td>
                  <td>{x.category}</td>
                  <td>{x.description ?? '—'}</td>
                  <td>{PAYMENT_LABEL[x.paid_via]}</td>
                  <td className="right">{formatINR(x.amount)}</td>
                  <td className="right">
                    <Button small onClick={() => setEditing(x)} aria-label={`Edit expense ${x.category} ${x.expense_date}`}>
                      Edit
                    </Button>{' '}
                    {isAdmin && (
                      <Button
                        small
                        variant="danger"
                        disabled={remove.isPending}
                        aria-label={`Delete expense ${x.category} ${x.expense_date}`}
                        onClick={() => void confirm({ title: 'Delete expense', message: `Delete this ${formatINR(x.amount)} ${x.category} expense?`, confirmLabel: 'Delete', danger: true }).then((ok) => ok && remove.mutate(x.id))}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
      {editing && <ExpenseDialog expense={editing === 'new' ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  )
}
