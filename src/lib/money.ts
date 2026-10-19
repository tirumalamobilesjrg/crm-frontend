const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

export function formatINR(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : inr.format(value)
}

/** Parses a rupee amount typed by a person ("70,000", "799.50"). Returns null if it is not a valid amount. */
export function parseRupees(input: string): number | null {
  const typed = input.replace(/[\s₹]/g, '')
  // Commas are accepted only as thousands separators (70,000 or 1,00,000). "250,00" is a decimal comma and would be
  // read as 25,000 rupees, so it is refused instead of guessed.
  const grouped = /^(\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})+,\d{3})(\.\d{1,2})?$/.test(typed)
  if (!grouped && !/^\d+(\.\d{1,2})?$/.test(typed)) return null
  return Number(typed.replace(/,/g, ''))
}

/** Integer paise, so amounts compare exactly. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100)
