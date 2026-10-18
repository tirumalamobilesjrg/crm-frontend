import type { ShopProfile } from '../../lib/types'

export type ShopProfileForm = Record<keyof ShopProfile, string>

export const LIMITS = { shop_name: 120, address: 500, phone: 30, whatsapp: 30, email: 120, opening_hours: 500, map_url: 500, about: 2000 } as const

export const toForm = (p: ShopProfile): ShopProfileForm => ({
  shop_name: p.shop_name,
  address: p.address ?? '',
  phone: p.phone ?? '',
  whatsapp: p.whatsapp ?? '',
  email: p.email ?? '',
  opening_hours: p.opening_hours ?? '',
  map_url: p.map_url ?? '',
  about: p.about ?? '',
})

const digits = (s: string) => s.replace(/\D/g, '')

/** Trims every field; blank optional fields become null. Returns the first problem in plain words. */
export function validateShopProfile(f: ShopProfileForm): { error: string | null; value: ShopProfile | null } {
  const v = Object.fromEntries(Object.entries(f).map(([k, s]) => [k, s.trim()])) as ShopProfileForm
  const bad = (error: string) => ({ error, value: null })
  if (!v.shop_name) return bad('Enter the shop name.')
  for (const k of Object.keys(LIMITS) as Array<keyof typeof LIMITS>) {
    if (v[k].length > LIMITS[k]) return bad(`That text is too long (at most ${LIMITS[k]} characters).`)
  }
  for (const k of ['phone', 'whatsapp'] as const) {
    if (v[k] && (digits(v[k]).length < 10 || digits(v[k]).length > 15)) return bad(`${k === 'phone' ? 'Phone' : 'WhatsApp'} number: enter 10 to 15 digits.`)
  }
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return bad('Enter a valid email address.')
  if (v.map_url && !/^https:\/\/[^\s]+$/.test(v.map_url)) return bad('The map link must start with https:// (copy it from Google Maps "Share").')
  const opt = (s: string) => (s === '' ? null : s)
  return {
    error: null,
    value: {
      shop_name: v.shop_name,
      address: opt(v.address),
      phone: opt(v.phone),
      whatsapp: opt(v.whatsapp),
      email: opt(v.email),
      opening_hours: opt(v.opening_hours),
      map_url: opt(v.map_url),
      about: opt(v.about),
    },
  }
}
