import { supabase } from '../lib/supabase'
import { toAppError } from '../lib/errors'
import type { AuditEntry } from '../lib/types'
import { PAGE_SIZE } from './inventory'

// Admin only: row-level security returns no rows to anyone else. Entries are append-only; nothing here can change them.

export interface AuditFilter {
  page: number
  /** Pre-sanitised text matched against the action (e.g. "sale", "stock", "identifier"). */
  action: string
  /** Pre-sanitised text matched against the table name. */
  table: string
}

export async function listAudit(f: AuditFilter): Promise<{ rows: AuditEntry[]; total: number }> {
  let q = supabase.from('audit_logs').select('id, occurred_at, actor_id, actor_role, action, table_name, record_id, detail', { count: 'exact' })
  if (f.action) q = q.ilike('action', `*${f.action}*`)
  if (f.table) q = q.ilike('table_name', `*${f.table}*`)
  const from = (f.page - 1) * PAGE_SIZE
  const { data, error, count } = await q.order('id', { ascending: false }).range(from, from + PAGE_SIZE - 1)
  if (error) throw toAppError(error)
  return { rows: (data ?? []) as AuditEntry[], total: count ?? 0 }
}
