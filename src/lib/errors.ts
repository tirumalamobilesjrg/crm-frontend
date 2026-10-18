// Turns Supabase / PostgREST / Auth errors into messages a shop employee can act on.
// Database SQLSTATE codes are documented in crm-backend docs/API_CONTRACTS.md.

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

function duplicateMessage(details: string | undefined): string {
  const m = details?.match(/Key \(([^)]+)\)=\(([^)]*)\)/)
  if (!m) return 'That value already exists.'
  const field = (m[1] ?? '').replace(/_/g, ' ').replace(/lower\(([^)]+)\)/, '$1')
  return `A record with this ${field} ("${m[2] ?? ''}") already exists.`
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
  if (code === '23505') return new AppError(duplicateMessage(details), code)
  if (code === '23514') return new AppError(message ? `A value is not allowed: ${message}` : 'A value is not allowed.', code)
  if (code === 'TM003' || code === 'TM012') return new AppError(message ?? 'The request is not valid.', code)
  if (code && BY_CODE[code]) return new AppError(BY_CODE[code], code)
  if (err instanceof TypeError) return new AppError('Cannot reach the server. Check your internet connection.', 'network')
  return new AppError(message ?? 'Something went wrong. Please try again.', code)
}
