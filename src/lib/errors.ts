// Turns Supabase / PostgREST / Auth errors into messages a shop employee can act on.
// Database SQLSTATE codes are documented in crm-backend docs/API_CONTRACTS.md.
//
// Rule: nothing the database says is shown verbatim unless it is a known, reviewed message. Raw SQL, constraint
// definitions, row dumps, internal ids and stack traces never reach the user; unknown errors get a generic message
// and are logged for developers only (development builds).

export class AppError extends Error {
  code: string | undefined
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

interface ErrorLike {
  message?: unknown
  code?: unknown
  details?: unknown
  error_code?: unknown
}

export const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

const BY_CODE: Record<string, string> = {
  '42501': 'You do not have permission to do that.',
  TM002: 'This request was already sent with different details. Please start the action again.',
  TM004: 'That item is not available (already sold, or not enough stock).',
  TM005: 'That discount is not allowed. Ask an Admin for a discount approval.',
  TM006: 'The payment amount must equal the sale total exactly.',
  TM007: 'That purchase can no longer be changed.',
  TM010: 'That record is protected and cannot be changed.',
  TM011: 'The last active Admin cannot be demoted or deactivated.',
  TM013: 'That action does not apply to this kind of product.',
  '23503': 'That record is still in use elsewhere, so it cannot be changed or removed.',
  '22P02': 'One of the values has an invalid format.',
  '23502': 'A required value is missing.',
}

const BY_AUTH_CODE: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'This email address has not been confirmed yet.',
  over_request_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  user_banned: 'This account has been disabled.',
}

// Unique constraints we know about (name -> message). Matching is on the constraint name quoted in the PostgreSQL
// message, so expression indexes such as lower(name) are covered without parsing the key text.
const identifierTaken = (what: string) => (value: string | undefined) =>
  value ? `${what} ${value} is already recorded on another device.` : `That ${what.toLowerCase()} is already recorded on another device.`

const UNIQUE_BY_CONSTRAINT: Record<string, (value: string | undefined) => string> = {
  suppliers_name_key: () => 'A supplier with this name already exists.',
  purchases_supplier_invoice_key: () => 'This supplier already has a purchase with that invoice number.',
  inventory_items_imei1_key: identifierTaken('IMEI'),
  inventory_items_imei2_key: identifierTaken('IMEI'),
  inventory_items_serial_key: identifierTaken('Serial number'),
  inventory_identifiers_active_key: identifierTaken('IMEI or serial number'),
}

// Fallback for unique violations on a constraint we do not know, keyed by the (plain) column in the details.
const UNIQUE_BY_COLUMN: Record<string, string> = {
  sku: 'SKU',
  slug: 'name',
  name: 'name',
  phone: 'phone number',
  imei1: 'IMEI',
  imei2: 'IMEI',
  serial_number: 'serial number',
  invoice_number: 'invoice number',
}

// Check constraints we know about.
const CHECK_BY_CONSTRAINT: Record<string, string> = {
  inventory_imei1_valid: 'That IMEI is not valid. It must be 15 digits with a correct check digit.',
  inventory_imei2_valid: 'That IMEI is not valid. It must be 15 digits with a correct check digit.',
  inventory_serial_valid: 'That serial number is not valid. Use 4 to 40 letters, digits or dashes.',
  inventory_has_identifier: 'A device needs an IMEI 1 or a serial number.',
  inventory_imei2_needs_imei1: 'IMEI 2 needs an IMEI 1.',
  inventory_imeis_differ: 'IMEI 2 must be different from IMEI 1.',
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function constraintName(message: string | undefined): string | undefined {
  return message?.match(/constraint "([^"]+)"/)?.[1]
}

/** Parses `Key (col)=(value) already exists.`; tolerant of expression keys such as `Key (lower(name::text))=(x)`. */
function parseKey(details: string | undefined): { column: string | undefined; value: string | undefined } {
  const m = details?.match(/^Key \((.*)\)=\((.*)\) already exists\.?$/s)
  if (!m) return { column: undefined, value: undefined }
  const column = /^[a-z_0-9]+$/.test(m[1] ?? '') ? m[1] : undefined
  return { column, value: m[2] }
}

function uniqueMessage(message: string | undefined, details: string | undefined): string {
  const { column, value } = parseKey(details)
  const named = UNIQUE_BY_CONSTRAINT[constraintName(message) ?? '']
  if (named) return named(value)
  const label = column ? UNIQUE_BY_COLUMN[column] : undefined
  if (label && value) return `A record with this ${label} ("${value}") already exists.`
  return 'That value already exists.'
}

function purchaseStateMessage(message: string | undefined): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('already received')) return 'This purchase has already been received, so it cannot be changed.'
  if (m.includes('already cancelled')) return 'This purchase was cancelled, so it cannot be changed.'
  if (m.includes('no lines')) return 'Add at least one line to this purchase before receiving it.'
  if (m.includes('through receive_purchase')) return 'A purchase can only be marked received by receiving its stock.'
  return BY_CODE.TM007 as string
}

function invalidRequestMessage(message: string | undefined): string {
  const m = message ?? ''
  if (/expects \d+ units? but \d+ (was|were) supplied/i.test(m))
    return 'The number of IMEI or serial numbers does not match the quantity on the purchase. Refresh the page and check each line.'
  if (/quantity SKU and takes no unit list/i.test(m)) return 'Accessories are received by quantity; they do not take IMEI numbers.'
  if (/units must be an array/i.test(m)) return 'Too many units in one receipt. Split the delivery into smaller purchases.'
  // Reviewed server wording is shown as-is, but never when it carries an internal id.
  if (m && !UUID.test(m)) return m
  return 'The request was not valid. Refresh the page and check the details.'
}

function logUnhandled(err: unknown): void {
  if (import.meta.env.DEV) console.warn('[errors] unhandled error (shown to the user as a generic message):', err)
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const e = (err ?? {}) as ErrorLike
  const code = typeof e.code === 'string' ? e.code : undefined
  // supabase-js AuthApiError exposes the machine code as `code`; raw GoTrue JSON uses `error_code`.
  const authCode = typeof e.error_code === 'string' ? e.error_code : code && BY_AUTH_CODE[code] ? code : undefined
  const message = typeof e.message === 'string' ? e.message : undefined
  const details = typeof e.details === 'string' ? e.details : undefined

  if (authCode && BY_AUTH_CODE[authCode]) return new AppError(BY_AUTH_CODE[authCode], authCode)
  if (code === '23505') return new AppError(uniqueMessage(message, details), code)
  if (code === '23514') {
    return new AppError(CHECK_BY_CONSTRAINT[constraintName(message) ?? ''] ?? 'A value is not allowed. Check what you entered and try again.', code)
  }
  if (code === 'TM007') return new AppError(purchaseStateMessage(message), code)
  if (code === 'TM003' || code === 'TM012') return new AppError(invalidRequestMessage(message), code)
  if (code && BY_CODE[code]) return new AppError(BY_CODE[code], code)
  if (err instanceof TypeError) return new AppError('Cannot reach the server. Check your internet connection.', 'network')
  logUnhandled(err)
  return new AppError(GENERIC_MESSAGE, code)
}
