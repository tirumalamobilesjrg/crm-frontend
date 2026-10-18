import type { StaffRole } from '../../lib/types'
import { parseRupees } from '../../lib/money'

export interface PolicyForm {
  role: StaffRole
  can_discount: boolean
  max_percent: string
  max_amount: string // empty = no cap
  can_approve: boolean
}

export interface ParsedPolicy {
  role: StaffRole
  can_discount: boolean
  max_percent: number
  max_amount: number | null
  can_approve: boolean
}

// Mirrors the database rules (discount_policy_consistent, discount_policy_manager_no_approve) so users get a
// clear message first. The database remains the authority.
export function validatePolicy(f: PolicyForm): { error: string | null; value: ParsedPolicy | null } {
  const percent = f.max_percent.trim() === '' ? 0 : Number(f.max_percent)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || !/^\d+(\.\d{1,2})?$/.test(f.max_percent.trim() || '0')) {
    return { error: 'Percent must be between 0 and 100 with at most 2 decimals.', value: null }
  }
  let amount: number | null = null
  if (f.max_amount.trim() !== '') {
    amount = parseRupees(f.max_amount)
    if (amount === null || amount <= 0) return { error: 'The per-sale cap must be a positive rupee amount, or empty for no cap.', value: null }
  }
  if (!f.can_discount && (percent !== 0 || amount !== null)) {
    return { error: 'Discounting is switched off, so the percent must be 0 and the cap empty.', value: null }
  }
  if (f.can_approve && f.role !== 'admin') return { error: 'Only an Admin can be allowed to approve discounts.', value: null }
  if (f.can_approve && !f.can_discount) return { error: 'Approving discounts requires discounting to be allowed.', value: null }
  return {
    error: null,
    value: { role: f.role, can_discount: f.can_discount, max_percent: percent, max_amount: amount, can_approve: f.can_approve },
  }
}
