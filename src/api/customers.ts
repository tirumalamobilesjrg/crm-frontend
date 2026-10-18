import { supabase } from '../lib/supabase'
import { toAppError } from '../lib/errors'
import type { CustomerInvoiceRow, CustomerRecord } from '../lib/types'
import { run, runChange } from './db'
import { PAGE_SIZE } from './inventory'
import type { CustomerInput } from './sales'

// Both roles may read, create and edit customers. Only an Admin may delete one, and the database refuses to delete a
// customer who has sales (they are referenced by invoices), so the UI offers deletion only as an Admin convenience.

const COLUMNS = 'id, name, phone, email, address, notes, created_at'

export async function listCustomers(opts: { page: number; term: string }): Promise<{ rows: CustomerRecord[]; total: number }> {
  let q = supabase.from('customers').select(COLUMNS, { count: 'exact' })
  if (opts.term) q = q.or(`name.ilike.*${opts.term}*,phone.ilike.*${opts.term}*,email.ilike.*${opts.term}*`)
  const from = (opts.page - 1) * PAGE_SIZE
  const { data, error, count } = await q.order('name').order('id').range(from, from + PAGE_SIZE - 1)
  if (error) throw toAppError(error)
  return { rows: (data ?? []) as CustomerRecord[], total: count ?? 0 }
}

export const getCustomer = (id: string) => run<CustomerRecord>(supabase.from('customers').select(COLUMNS).eq('id', id).single())

export const updateCustomer = (id: string, patch: CustomerInput) =>
  runChange(supabase.from('customers').update(patch).eq('id', id).select('id'))

/** Admin only (RLS). A customer with sales cannot be deleted (23503). */
export const deleteCustomer = (id: string) => runChange(supabase.from('customers').delete().eq('id', id).select('id'))

export const listCustomerInvoices = (customerId: string) =>
  run<CustomerInvoiceRow[]>(
    supabase
      .from('invoices')
      .select('id, sale_id, invoice_number, issued_at, subtotal, discount_total, grand_total')
      .eq('customer_id', customerId)
      .order('issued_at', { ascending: false })
      .limit(200),
  )
