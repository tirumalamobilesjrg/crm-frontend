import brands from '../../assets/brand-logos/brands.json'

// A curated gallery of phone and accessory brand logos (src/assets/brand-logos, sources in SOURCES.md). The files are loaded
// only when the picker opens: `previews` gives each file's address for the grid, `raws` its text for uploading the choice.
// Migration 0026 allows SVG, PNG and WebP up to 256 KiB in the public `brand-logos` bucket.

export interface CuratedLogo {
  slug: string
  name: string
}

export const CURATED_LOGOS: ReadonlyArray<CuratedLogo> = brands

const previews = import.meta.glob<string>('../../assets/brand-logos/*.svg', { query: '?url', import: 'default' })
const raws = import.meta.glob<string>('../../assets/brand-logos/*.svg', { query: '?raw', import: 'default' })
const keyFor = (slug: string) => `../../assets/brand-logos/${slug}.svg`

export const loadLogoPreview = (slug: string): Promise<string> => {
  const load = previews[keyFor(slug)]
  return load ? load() : Promise.reject(new Error(`No logo ${slug}`))
}

/** The SVG as a file ready to upload. */
export async function loadCuratedLogo(slug: string): Promise<File> {
  const load = raws[keyFor(slug)]
  if (!load) throw new Error(`No logo ${slug}`)
  return new File([await load()], `${slug}.svg`, { type: 'image/svg+xml' })
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Logos whose name contains what was typed (spaces and punctuation ignored: "one plus" finds OnePlus). Empty search lists all. */
export function matchLogos(search: string): CuratedLogo[] {
  const q = squash(search)
  return q === '' ? [...CURATED_LOGOS] : CURATED_LOGOS.filter((l) => squash(l.name).includes(q) || l.slug.replace(/-/g, '').includes(q))
}

/** The logo for a brand name typed in the "new brand" form, when the name is exactly one of the curated brands. */
export const suggestLogo = (brandName: string): CuratedLogo | undefined => {
  const q = squash(brandName)
  return q === '' ? undefined : CURATED_LOGOS.find((l) => squash(l.name) === q)
}

// ---- uploading a logo

export const MAX_LOGO_BYTES = 256 * 1024
export const LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/webp'] as const
const EXTENSION: Record<string, string> = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp' }

export function validateLogoFile(file: { type: string; size: number } | null): string | null {
  if (!file) return 'Choose a logo file first.'
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return 'Use a PNG or WebP image. (SVG logos come from the gallery.)'
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > MAX_LOGO_BYTES) return 'That logo is larger than 256 KB. Save a smaller version (a logo needs about 400 px at most).'
  return null
}

/** Object name inside the bucket: brands/<brand slug>/<random>.<ext>. The random part avoids stale caches when a logo is replaced. */
export const logoPath = (slug: string, type: string, random: string): string => `brands/${slug}/${random}.${EXTENSION[type] ?? 'bin'}`

/** What the brand form holds before the brand exists: nothing, a gallery logo, or the staff member's own file. */
export type LogoChoice = { kind: 'curated'; logo: CuratedLogo } | { kind: 'file'; file: File }

export const choiceToFile = (choice: LogoChoice): Promise<File> => (choice.kind === 'file' ? Promise.resolve(choice.file) : loadCuratedLogo(choice.logo.slug))
