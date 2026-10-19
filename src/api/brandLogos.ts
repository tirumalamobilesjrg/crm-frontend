import { supabase } from '../lib/supabase'
import { AppError, toAppError } from '../lib/errors'
import { logoPath, validateLogoFile } from '../features/catalogue/logoGallery'
import { runChange } from './db'

// Brand logos live in the public Storage bucket `brand-logos` (backend migration 0026): public read, only active staff may write,
// 256 KiB, SVG/PNG/WebP. brands.logo_path points at the object.

export const LOGO_BUCKET = 'brand-logos'

/** The address a logo is loaded from. No login is needed for it. */
export const brandLogoUrl = (path: string): string => supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl

/**
 * Uploads the file and points the brand at it. If pointing fails the new file is removed again; the brand's previous logo
 * file is removed once the new one is in place (a failed clean-up is harmless: the file is just unused). Returns the new path.
 */
export async function saveBrandLogo(brand: { id: string; slug: string; logo_path: string | null }, file: File, random: string): Promise<string> {
  const problem = validateLogoFile(file)
  if (problem) throw new AppError(problem, 'invalid_logo')
  const path = logoPath(brand.slug, file.type, random)
  const up = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (up.error) throw toAppError(up.error)
  try {
    await runChange(supabase.from('brands').update({ logo_path: path }).eq('id', brand.id).select('id'))
  } catch (e) {
    await supabase.storage.from(LOGO_BUCKET).remove([path])
    throw toAppError(e)
  }
  if (brand.logo_path) await supabase.storage.from(LOGO_BUCKET).remove([brand.logo_path])
  return path
}

export async function removeBrandLogo(brand: { id: string; logo_path: string | null }): Promise<void> {
  await runChange(supabase.from('brands').update({ logo_path: null }).eq('id', brand.id).select('id'))
  if (brand.logo_path) await supabase.storage.from(LOGO_BUCKET).remove([brand.logo_path])
}
