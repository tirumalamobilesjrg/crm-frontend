import type { ProductImage, ProductSpec } from '../../lib/types'

// Mirrors the bucket rules (migration 0021). Storage enforces them again; this gives instant, specific feedback.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024 // what is stored (after the browser has shrunk the photo)
export const MAX_INPUT_BYTES = 15 * 1024 * 1024 // what staff may pick: a full camera photo
export const MAX_BATCH = 10 // photos per upload; they are sent one at a time
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function validatePhoto(file: { type: string; size: number } | null): string | null {
  if (!file) return 'Choose a photo first.'
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Use a JPEG, PNG or WebP photo.'
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > MAX_PHOTO_BYTES) return 'That photo is larger than 2 MB. Shrink it or save it at a lower quality.'
  return null
}

/** The photo as chosen, before it is shrunk: any JPEG/PNG/WebP up to 15 MB. */
export function validateChosen(file: { type: string; size: number } | null): string | null {
  if (!file) return 'Choose a photo first.'
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Use a JPEG, PNG or WebP photo.'
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > MAX_INPUT_BYTES) return 'That photo is larger than 15 MB. Take it again at a lower quality.'
  return null
}

/** Object name inside the bucket: products/<product id>/<random>.<ext>. The random part also avoids guessable URLs and name clashes. */
export function photoPath(productId: string, type: string, random: string): string {
  return `products/${productId}/${random}.${EXTENSION[type] ?? 'bin'}`
}

export function validateAlt(alt: string): string | null {
  return alt.length > 200 ? 'Keep the description under 200 characters.' : null
}

export interface SpecForm { group: string; key: string; value: string; order: string }

export function validateSpec(f: SpecForm): { errors: Partial<Record<keyof SpecForm, string>>; value: { group_name: string; spec_key: string; spec_value: string; sort_order: number } | null } {
  const errors: Partial<Record<keyof SpecForm, string>> = {}
  const group = f.group.trim() || 'General'
  const key = f.key.trim()
  const value = f.value.trim()
  if (group.length > 60) errors.group = 'Group names are up to 60 characters.'
  if (key.length < 1 || key.length > 60) errors.key = 'Enter the name of the specification (up to 60 characters), e.g. Display.'
  if (value.length < 1 || value.length > 300) errors.value = 'Enter its value (up to 300 characters), e.g. 6.5 inch AMOLED.'
  const order = f.order.trim() === '' ? 0 : /^-?\d{1,4}$/.test(f.order.trim()) ? Number(f.order.trim()) : NaN
  if (Number.isNaN(order)) errors.order = 'Order must be a whole number (or empty).'
  if (Object.keys(errors).length > 0) return { errors, value: null }
  return { errors, value: { group_name: group, spec_key: key, spec_value: value, sort_order: order } }
}

/** Groups in first-appearance order of their lowest sort_order, rows ordered by sort_order then name. */
export function groupSpecs(specs: ProductSpec[]): Array<{ group: string; rows: ProductSpec[] }> {
  const sorted = [...specs].sort((a, b) => a.sort_order - b.sort_order || a.spec_key.localeCompare(b.spec_key))
  const groups = new Map<string, ProductSpec[]>()
  for (const s of sorted) groups.set(s.group_name, [...(groups.get(s.group_name) ?? []), s])
  return [...groups.entries()].map(([group, rows]) => ({ group, rows }))
}

/** Photos in display order: sort_order, then upload time. The primary photo is shown first on the website regardless. */
export const sortImages = (images: ProductImage[]): ProductImage[] =>
  [...images].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
