const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

export function formatINR(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : inr.format(value)
}

/** Parses a rupee amount typed by a person ("70,000", "799.50"). Returns null if it is not a valid amount. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Number(cleaned)
}

/** Integer paise, so amounts compare exactly. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100)
