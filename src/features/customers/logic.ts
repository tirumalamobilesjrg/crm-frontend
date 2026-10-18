import { validateCustomer } from '../pos/logic'

export interface CustomerEditForm {
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

export const EMPTY_CUSTOMER: CustomerEditForm = { name: '', phone: '', email: '', address: '', notes: '' }

/** Same rules as the quick-add in the POS, plus free-text notes (up to 500 characters). */
export function validateCustomerEdit(f: CustomerEditForm): {
  errors: Partial<Record<keyof CustomerEditForm, string>>
  value: { name: string; phone: string | null; email: string | null; address: string | null; notes: string | null } | null
} {
  const base = validateCustomer({ name: f.name, phone: f.phone, email: f.email, address: f.address })
  const errors: Partial<Record<keyof CustomerEditForm, string>> = { ...base.errors }
  if (f.notes.length > 500) errors.notes = 'Notes can be up to 500 characters.'
  if (!base.value || errors.notes) return { errors, value: null }
  return { errors, value: { ...base.value, notes: f.notes.trim() === '' ? null : f.notes.trim() } }
}
