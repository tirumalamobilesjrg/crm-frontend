import { supabase } from '../lib/supabase'
import type { DiscountPolicy, StaffProfile, StaffRole } from '../lib/types'
import { run } from './db'

export const listPolicies = () =>
  run<DiscountPolicy[]>(
    supabase.from('discount_policies').select('role, can_discount, max_percent, max_amount, can_approve, configured_at').order('role'),
  )

export const savePolicy = (p: Pick<DiscountPolicy, 'role' | 'can_discount' | 'max_percent' | 'max_amount' | 'can_approve'>) =>
  run(
    supabase
      .from('discount_policies')
      .update({ can_discount: p.can_discount, max_percent: p.max_percent, max_amount: p.max_amount, can_approve: p.can_approve })
      .eq('role', p.role),
  )

export const listStaff = () =>
  run<StaffProfile[]>(
    supabase.from('staff_profiles').select('user_id, full_name, role, phone, is_active, created_at').order('full_name'),
  )

export const addStaff = (input: { user_id: string; full_name: string; role: StaffRole }) =>
  run(supabase.from('staff_profiles').insert(input))

export const updateStaff = (user_id: string, patch: Partial<Pick<StaffProfile, 'role' | 'is_active' | 'full_name'>>) =>
  run(supabase.from('staff_profiles').update(patch).eq('user_id', user_id))
