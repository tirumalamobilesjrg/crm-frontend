// Category pictures live in the public Storage bucket `category-images` (backend migration 0027): JPEG, PNG or WebP up to 1 MiB.
// The website shows them on the category tiles. A picture picked here is shrunk in the browser to about 900 px first.

export const MAX_CATEGORY_IMAGE_BYTES = 1024 * 1024 // what is stored
export const MAX_CATEGORY_INPUT_BYTES = 15 * 1024 * 1024 // what staff may pick
export const CATEGORY_IMAGE_SIDE = 900
export const CATEGORY_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** What was picked, before it is shrunk. */
export function validateCategoryChosen(file: { type: string; size: number } | null): string | null {
  if (!file) return 'Choose a picture first.'
  if (!(CATEGORY_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use a JPEG, PNG or WebP picture.'
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > MAX_CATEGORY_INPUT_BYTES) return 'That picture is larger than 15 MB. Choose a smaller one.'
  return null
}

/** What is about to be stored, after it was shrunk. */
export function validateCategoryImage(file: { type: string; size: number } | null): string | null {
  const chosen = validateCategoryChosen(file)
  if (chosen) return chosen
  if (file && file.size > MAX_CATEGORY_IMAGE_BYTES) return 'That picture is still larger than 1 MB after shrinking. Choose a simpler picture.'
  return null
}

/** Object name inside the bucket: categories/<category slug>/<random>.<ext>. The random part avoids stale caches when a picture is replaced. */
export const categoryImagePath = (slug: string, type: string, random: string): string => `categories/${slug}/${random}.${EXTENSION[type] ?? 'bin'}`
