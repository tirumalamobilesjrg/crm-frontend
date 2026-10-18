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
    it('names a duplicate product specification', () => {
      const e = toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "product_specifications_product_id_group_name_spec_key_key"', details: 'Key (product_id, group_name, spec_key)=(1, Display, Screen size) already exists.' })
      expect(e.message).toMatch(/already has a specification with that name/)
      expect(e.message).not.toMatch(/product_id|Display/)
    })
    it('tells apart a missing parent (insert) from a row still in use (delete) for foreign keys', () => {
      expect(toAppError({ code: '23503', message: 'insert or update on table "product_images" violates foreign key constraint "x"' }).message).toMatch(/no longer exists/)
      expect(toAppError({ code: '23503', message: 'update or delete on table "customers" violates foreign key constraint "y" on table "invoices"' }).message).toMatch(/still in use/)
    })
    it('names a duplicate customer phone number', () => {
      const e = toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "customers_phone_key"', details: 'Key (phone)=(9876543210) already exists.' })
      expect(e.message).toBe('A customer with this phone number already exists. Search for them instead.')
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
    it('explains the identifier rules enforced on correction', () => {
      const msg = (name: string) => toAppError({ code: '23514', message: `new row for relation "inventory_items" violates check constraint "${name}"`, details: 'Failing row contains (1, 2)' }).message
      expect(msg('inventory_has_identifier')).toBe('A device needs an IMEI 1 or a serial number.')
      expect(msg('inventory_imei2_needs_imei1')).toBe('IMEI 2 needs an IMEI 1.')
      expect(msg('inventory_imeis_differ')).toBe('IMEI 2 must be different from IMEI 1.')
    })
    it('explains the expense and customer rules', () => {
      const msg = (name: string) => toAppError({ code: '23514', message: `new row for relation "x" violates check constraint "${name}"`, details: 'Failing row contains (1, 2)' }).message
      expect(msg('expenses_amount_check')).toBe('The amount must be more than zero.')
      expect(msg('expenses_category_check')).toMatch(/Enter a category/)
      expect(msg('customers_phone_check')).toMatch(/7 to 15 digits/)
      expect(msg('customers_name_check')).toMatch(/customer name/)
    })
    it('explains the shop detail rules', () => {
      const msg = (name: string) => toAppError({ code: '23514', message: `new row for relation "shop_settings" violates check constraint "${name}"`, details: 'Failing row contains (t)' }).message
      expect(msg('shop_settings_map_url_check')).toMatch(/https/)
      expect(msg('shop_settings_about_check')).toMatch(/2000/)
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

  describe('discount approvals (TM005)', () => {
    it.each([
      ['discount approval was already used', /already used/],
      ['discount approval has expired', /has expired/],
      ['discount 1500 exceeds the approved amount 1000', /more than the approval allows/],
      ['discount approval not found for this user', /not granted to you/],
      ['the approver is not (or no longer) authorised for this discount', /no longer allowed/],
      ['discount exceeds your limit (5 % per line); ask an approver for a discount approval', /That discount is not allowed/],
    ])('maps %s', (message, expected) => expect(toAppError({ code: 'TM005', message }).message).toMatch(expected))
  })

  it('gives a clear message for the other business rules', () => {
    expect(toAppError({ code: 'TM005' }).message).toMatch(/discount/i)
    expect(toAppError({ code: 'TM006' }).message).toMatch(/payment/i)
    expect(toAppError({ code: 'TM011' }).message).toMatch(/last active Admin/)
    expect(toAppError({ code: 'TM002' }).message).toMatch(/different details/)
  })

  describe('photo storage', () => {
    const storage = (message: string) => toAppError({ name: 'StorageApiError', message, status: 400, statusCode: '400' }).message
    it('explains the size and type limits in plain words', () => {
      expect(storage('The object exceeded the maximum allowed size')).toMatch(/too big.*2 MB/)
      expect(storage('mime type image/gif is not supported')).toBe('Use a JPEG, PNG or WebP photo.')
    })
    it('maps permission and duplicate failures, and a missing bucket', () => {
      expect(storage('new row violates row-level security policy')).toMatch(/permission/i)
      expect(storage('The resource already exists')).toMatch(/already exists/)
      expect(storage('Bucket not found')).toMatch(/not set up/)
    })
    it('never shows an unknown storage message', () => {
      expect(storage('InternalError: connect ECONNREFUSED 10.0.0.5:5432')).toBe(GENERIC_MESSAGE)
    })
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
