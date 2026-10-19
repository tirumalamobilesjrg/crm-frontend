import { supabase } from '../lib/supabase'
import { AppError, toAppError } from '../lib/errors'
import type { ProductImage, ProductSpec } from '../lib/types'
import { photoPath, validatePhoto } from '../features/catalogue/media'
import { prepareForUpload } from '../features/catalogue/resize'
import { run, runChange } from './db'

// Photos live in the public Storage bucket `product-images` (backend migration 0021): public read, only active staff may write,
// 2 MiB, JPEG/PNG/WebP. Specifications and photo rows are ordinary tables writable by Admin and Manager.

export const BUCKET = 'product-images'
const SPEC_COLUMNS = 'id, product_id, group_name, spec_key, spec_value, sort_order'
const IMAGE_COLUMNS = 'id, product_id, storage_path, alt_text, sort_order, is_primary, created_at'

// ---- specifications

export const listSpecs = (productId: string) =>
  run<ProductSpec[]>(supabase.from('product_specifications').select(SPEC_COLUMNS).eq('product_id', productId).order('sort_order').order('spec_key'))

export interface SpecInput { group_name: string; spec_key: string; spec_value: string; sort_order: number }

export const addSpec = async (productId: string, input: SpecInput): Promise<void> => {
  await run(supabase.from('product_specifications').insert({ product_id: productId, ...input }))
}
export const updateSpec = (id: string, input: SpecInput) => runChange(supabase.from('product_specifications').update(input).eq('id', id).select('id'))
export const deleteSpec = (id: string) => runChange(supabase.from('product_specifications').delete().eq('id', id).select('id'))

// ---- photos

export const listImages = (productId: string) =>
  run<ProductImage[]>(supabase.from('product_images').select(IMAGE_COLUMNS).eq('product_id', productId).order('sort_order').order('created_at'))

/** The address the website (and this page) loads a photo from. No login is needed for it. */
export const photoUrl = (storagePath: string): string => supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl

/**
 * Uploads the file, then registers it. If registering fails the uploaded file is removed again so nothing is left behind.
 * The first photo of a product becomes its primary photo.
 */
export async function uploadPhoto(productId: string, chosen: File, alt: string, isFirst: boolean, random: string): Promise<ProductImage> {
  const file = await prepareForUpload(chosen) // shrinks a camera photo to about 1600 px (a few hundred KB) when the browser can
  const problem = validatePhoto(file)
  if (problem) throw new AppError(problem, 'invalid_photo')
  const path = photoPath(productId, file.type, random)
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (up.error) throw toAppError(up.error)
  try {
    const { data: last } = await supabase.from('product_images').select('sort_order').eq('product_id', productId).order('sort_order', { ascending: false }).limit(1)
    const nextOrder = ((last as Array<{ sort_order: number }> | null)?.[0]?.sort_order ?? -1) + 1
    return await run<ProductImage>(
      supabase.from('product_images').insert({ product_id: productId, storage_path: path, alt_text: alt.trim(), sort_order: nextOrder, is_primary: isFirst }).select(IMAGE_COLUMNS).single(),
    )
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([path])
    throw toAppError(e)
  }
}

export const updateImageAlt = (id: string, alt: string) => runChange(supabase.from('product_images').update({ alt_text: alt.trim() }).eq('id', id).select('id'))

/** Only one primary photo per product is allowed (unique index), so the old one is cleared first. */
export async function setPrimaryPhoto(productId: string, imageId: string): Promise<void> {
  await run(supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId).eq('is_primary', true))
  await runChange(supabase.from('product_images').update({ is_primary: true }).eq('id', imageId).select('id'))
}

/** Swaps the display position of two photos. */
export async function swapPhotoOrder(a: ProductImage, b: ProductImage): Promise<void> {
  await runChange(supabase.from('product_images').update({ sort_order: b.sort_order }).eq('id', a.id).select('id'))
  await runChange(supabase.from('product_images').update({ sort_order: a.sort_order }).eq('id', b.id).select('id'))
}

/** Removes the row first (so the website stops showing it), then the file. A leftover file is harmless; a row without a file is not. */
export async function deletePhoto(image: ProductImage): Promise<void> {
  await runChange(supabase.from('product_images').delete().eq('id', image.id).select('id'))
  const removed = await supabase.storage.from(BUCKET).remove([image.storage_path])
  if (removed.error && import.meta.env.DEV) console.warn('[productMedia] the photo row was removed but its file could not be deleted:', removed.error.message)
}
