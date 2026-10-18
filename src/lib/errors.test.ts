import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError, GENERIC_MESSAGE, toAppError } from './errors'

// Realistic PostgREST error bodies captured from a local Supabase run against the backend migrations.
const dupImei = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "inventory_items_imei1_key"',
  details: 'Key (imei1)=(490154203237518) already exists.',
}
const dupSupplierName = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "suppliers_name_key"',
  details: 'Key (lower(name::text))=(it supplier) already exists.',
}
const dupInvoice = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "purchases_supplier_invoice_key"',
  details: 'Key (supplier_id, lower(supplier_invoice_no::text))=(3ed1ad2e-1111-2222-3333-444455556666, ui-inv-1) already exists.',
}
const badImei = {
  code: '23514',
  message: 'new row for relation "inventory_items" violates check constraint "inventory_imei1_valid"',
  details: 'Failing row contains (4258cf40-2f53-4da1-8b3a-0ab7077af17a, 3ed1ad2e-aaaa-bbbb-cccc-ddddeeeeffff, 490154203237519).',
}

const FORBIDDEN = [/constraint/i, /violates/i, /relation/i, /inventory_items/i, /Failing row/i, /lower\(/i, /[0-9a-f]{8}-[0-9a-f]{4}-/i, /\bat .*\.(ts|js)/]
const expectSafe = (text: string) => FORBIDDEN.forEach((re) => expect(text).not.toMatch(re))

describe('toAppError', () => {
  beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => undefined))
  afterEach(() => vi.restoreAllMocks())

  it('maps permission errors', () => {
    expect(toAppError({ code: '42501', message: 'permission denied for table x' }).message).toMatch(/permission/i)
  })

  describe('duplicates (23505)', () => {
    it('keeps the friendly duplicate-IMEI message and shows the IMEI the user typed', () => {
      const e = toAppError(dupImei)
      expect(e.message).toBe('IMEI 490154203237518 is already recorded on another device.')
      expect(e.code).toBe('23505')
      expectSafe(e.message)
    })
    it('covers the serial and cross-column identifier constraints', () => {
      expect(toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "inventory_items_serial_key"', details: 'Key (serial_number)=(ABCD-1) already exists.' }).message).toBe(
        'Serial number ABCD-1 is already recorded on another device.',
      )
      expect(toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "inventory_identifiers_active_key"', details: 'Key (value)=(ABCD-1) already exists.' }).message).toMatch(/ABCD-1 is already recorded/)
    })
    it('detects a duplicate supplier name even though the key is lower(name)', () => {
      const e = toAppError(dupSupplierName)
      expect(e.message).toBe('A supplier with this name already exists.')
      expectSafe(e.message)
    })
    it('detects a duplicate supplier invoice number without leaking the supplier id', () => {
      const e = toAppError(dupInvoice)
      expect(e.message).toBe('This supplier already has a purchase with that invoice number.')
      expectSafe(e.message)
    })
    it('explains an unknown constraint using a plain column from the details', () => {
      const e = toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "product_variants_sku_key"', details: 'Key (sku)=(NOVA-1) already exists.' })
      expect(e.message).toBe('A record with this SKU ("NOVA-1") already exists.')
    })
    it('falls back to a generic message when nothing can be parsed', () => {
      expect(toAppError({ code: '23505', message: 'weird' }).message).toBe('That value already exists.')
      expect(toAppError({ code: '23505', details: 'Key (a, lower(b::text))=(x, y) already exists.' }).message).toBe('That value already exists.')
    })
  })

  describe('check constraints (23514)', () => {
    it('gives a field-specific message for a bad IMEI and hides the row dump', () => {
      const e = toAppError(badImei)
      expect(e.message).toBe('That IMEI is not valid. It must be 15 digits with a correct check digit.')
      expectSafe(e.message)
    })
    it('handles the IMEI 2 and serial constraints', () => {
      expect(toAppError({ code: '23514', message: 'new row violates check constraint "inventory_imei2_valid"' }).message).toMatch(/IMEI is not valid/)
      expect(toAppError({ code: '23514', message: 'new row violates check constraint "inventory_serial_valid"' }).message).toMatch(/serial number is not valid/)
    })
    it('never echoes an unknown check constraint', () => {
      const e = toAppError({ code: '23514', message: 'new row for relation "x" violates check constraint "secret_rule"', details: 'Failing row contains (1, 2)' })
      expect(e.message).toBe('A value is not allowed. Check what you entered and try again.')
      expectSafe(e.message)
    })
  })

  describe('purchase state (TM007) and counts (TM003)', () => {
    it.each([
      ['purchase is already received', /already been received/],
      ['purchase is already cancelled', /was cancelled/],
      ['purchase has no lines', /at least one line/],
      ['purchases can only be received through receive_purchase()', /marked received by receiving/],
      ['purchase lines can only be changed while the purchase is a draft', /can no longer be changed/],
    ])('maps %s', (message, expected) => {
      const e = toAppError({ code: 'TM007', message })
      expect(e.message).toMatch(expected)
      expectSafe(e.message)
    })
    it('replaces the unit-count error, which contains a line id, with an actionable message', () => {
      const e = toAppError({ code: 'TM003', message: 'purchase line b80e82cf-aec1-42c3-9a42-5985960b98f4 expects 2 units but 1 were supplied' })
      expect(e.message).toMatch(/number of IMEI or serial numbers does not match/)
      expectSafe(e.message)
    })
    it('maps the other receiving shape errors', () => {
      expect(toAppError({ code: 'TM003', message: 'purchase line 11111111-1111-1111-1111-111111111111 is a quantity SKU and takes no unit list' }).message).toMatch(/Accessories are received by quantity/)
      expect(toAppError({ code: 'TM003', message: 'units must be an array of at most 1000 devices (use [] for quantity-only purchases)' }).message).toMatch(/Too many units/)
    })
    it('still shows reviewed server wording for validation errors that carry no internal id', () => {
      expect(toAppError({ code: 'TM003', message: 'a discount reason is required' }).message).toBe('a discount reason is required')
    })
    it('hides unreviewed TM003 wording that contains an internal id', () => {
      const e = toAppError({ code: 'TM003', message: 'a unit refers to a purchase line 11111111-1111-1111-1111-111111111111 that is odd' })
      expect(e.message).toBe('The request was not valid. Refresh the page and check the details.')
    })
  })

  it('gives a clear message for the other business rules', () => {
    expect(toAppError({ code: 'TM005' }).message).toMatch(/discount/i)
    expect(toAppError({ code: 'TM006' }).message).toMatch(/payment/i)
    expect(toAppError({ code: 'TM011' }).message).toMatch(/last active Admin/)
    expect(toAppError({ code: 'TM002' }).message).toMatch(/different details/)
  })

  describe('auth and network', () => {
    it('maps the error shape supabase-js really throws (code, not error_code)', () => {
      expect(toAppError({ name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' }).message).toBe('Wrong email or password.')
    })
    it('maps raw GoTrue error_code', () => {
      expect(toAppError({ error_code: 'invalid_credentials', message: 'Invalid login credentials' }).message).toBe('Wrong email or password.')
    })
    it('recognises network failures', () => {
      expect(toAppError(new TypeError('Failed to fetch')).code).toBe('network')
    })
  })

  describe('unknown errors', () => {
    it('shows a generic message, never the raw text, and logs for developers', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const raw = { code: 'XX000', message: 'relation "secret_table" does not exist at character 15', details: 'select * from secret_table' }
      const e = toAppError(raw)
      expect(e.message).toBe(GENERIC_MESSAGE)
      expectSafe(e.message)
      expect(e.message).not.toMatch(/secret_table/)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unhandled'), raw)
    })
    it('treats a plain JavaScript error the same way', () => {
      const e = toAppError(new Error("Cannot read properties of undefined (reading 'x')"))
      expect(e.message).toBe(GENERIC_MESSAGE)
    })
    it('passes AppError through and has a fallback for null', () => {
      const a = new AppError('x')
      expect(toAppError(a)).toBe(a)
      expect(toAppError(null).message).toBe(GENERIC_MESSAGE)
    })
  })
})
