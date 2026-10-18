/** Luhn check over a digit string. */
export function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,39}$/

export type Identifier = { kind: 'imei'; value: string } | { kind: 'serial'; value: string }

export type IdentifierCheck = { ok: true; id: Identifier } | { ok: false; error: string }

/**
 * Interprets what a scanner or person typed into a unit box. A 15-digit value is an IMEI (check digit verified,
 * as the database does); any other all-digit value is rejected as a mistyped IMEI; everything else must look
 * like a serial number (upper-cased, as the database stores it).
 */
export function checkIdentifier(raw: string): IdentifierCheck {
  const value = raw.trim().toUpperCase()
  if (value === '') return { ok: false, error: 'Required' }
  if (/^\d+$/.test(value)) {
    if (value.length !== 15) return { ok: false, error: `IMEI must be 15 digits (got ${value.length})` }
    if (!luhnValid(value)) return { ok: false, error: 'Not a valid IMEI (check digit is wrong)' }
    return { ok: true, id: { kind: 'imei', value } }
  }
  if (!SERIAL_PATTERN.test(value)) return { ok: false, error: 'Serial: 4-40 letters, digits or -' }
  return { ok: true, id: { kind: 'serial', value } }
}
