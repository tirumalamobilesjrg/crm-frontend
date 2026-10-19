import { supabase } from '../lib/supabase'
import { AppError, toAppError } from '../lib/errors'
import { categoryImagePath, CATEGORY_IMAGE_SIDE, validateCategoryChosen, validateCategoryImage } from '../features/catalogue/categoryImage'
import { prepareForUpload } from '../features/catalogue/resize'
import { runChange } from './db'

// Category pictures live in the public Storage bucket `category-images` (backend migration 0027): public read, only active
// staff may write, 1 MiB, JPEG/PNG/WebP. categories.image_path points at the object.

export const CATEGORY_BUCKET = 'category-images'

/** The address a picture is loaded from. No login is needed for it. */
export const categoryImageUrl = (path: string): string => supabase.storage.from(CATEGORY_BUCKET).getPublicUrl(path).data.publicUrl

/**
 * Shrinks the picture, uploads it, then points the category at it. If pointing fails the new file is removed again; the
 * category's previous picture is removed once the new one is in place. Returns the new path.
 */
export async function saveCategoryImage(category: { id: string; slug: string; image_path: string | null }, chosen: File, random: string): Promise<string> {
  const early = validateCategoryChosen(chosen)
  if (early) throw new AppError(early, 'invalid_picture')
  const file = await prepareForUpload(chosen, CATEGORY_IMAGE_SIDE, 200 * 1024)
  const problem = validateCategoryImage(file)
  if (problem) throw new AppError(problem, 'invalid_picture')
  const path = categoryImagePath(category.slug, file.type, random)
  const up = await supabase.storage.from(CATEGORY_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (up.error) throw toAppError(up.error)
  try {
    await runChange(supabase.from('categories').update({ image_path: path }).eq('id', category.id).select('id'))
  } catch (e) {
    await supabase.storage.from(CATEGORY_BUCKET).remove([path])
    throw toAppError(e)
  }
  if (category.image_path) await supabase.storage.from(CATEGORY_BUCKET).remove([category.image_path])
  return path
}

export async function removeCategoryImage(category: { id: string; image_path: string | null }): Promise<void> {
  await runChange(supabase.from('categories').update({ image_path: null }).eq('id', category.id).select('id'))
  if (category.image_path) await supabase.storage.from(CATEGORY_BUCKET).remove([category.image_path])
}
