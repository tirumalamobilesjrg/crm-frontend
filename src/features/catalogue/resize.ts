// Phone cameras produce 3-8 MB photos; the shop only needs about 1600 px. Photos are shrunk in the browser before they are
// uploaded, so staff can use the original camera photo and the website (which serves the file as stored) stays fast.

export const MAX_SIDE = 1600
const QUALITY = 0.82
const KEEP_IF_SMALLER_THAN = 350 * 1024

/** Pure sizing rule, exported for tests: scale down so the longest side is at most MAX_SIDE, never up. */
export function targetSize(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const k = maxSide / longest
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

const baseName = (name: string) => name.replace(/\.[^./\\]+$/, '') || 'photo'

/**
 * Returns a smaller WebP (or JPEG) copy when that helps, otherwise the original file. Never throws: if the browser
 * cannot decode or encode the image, the original is returned and the normal size check decides.
 */
export async function prepareForUpload(file: File, maxSide = MAX_SIDE, keepIfSmallerThan = KEEP_IF_SMALLER_THAN): Promise<File> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
    const bitmap = await createImageBitmap(file)
    const { width, height } = targetSize(bitmap.width, bitmap.height, maxSide)
    const scaled = width !== bitmap.width
    if (!scaled && file.size <= keepIfSmallerThan) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY))
    if (!blob || (blob.type !== 'image/webp' && blob.type !== 'image/jpeg') || blob.size === 0) return file
    if (!scaled && blob.size >= file.size) return file
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `${baseName(file.name)}.${ext}`, { type: blob.type })
  } catch {
    return file
  }
}
