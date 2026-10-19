import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = [string, unknown[]]
const calls: Call[] = []
let queue: Array<{ data: unknown; error: unknown }> = []
const builder: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(queue.length > 0 ? queue.shift() : { data: [{ id: 'c1' }], error: null }).then(resolve)
      return (...args: unknown[]) => {
        calls.push([prop, args])
        return builder
      }
    },
  },
)
const storage = {
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn((p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/category-images/${p}` } })),
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t: string) => (calls.push(['from', [t]]), builder), storage: { from: (b: string) => (calls.push(['storage.from', [b]]), storage) } },
}))

import { CATEGORY_BUCKET, categoryImageUrl, removeCategoryImage, saveCategoryImage } from './categoryImages'

const named = (name: string) => calls.filter(([n]) => n === name).map(([, a]) => a)
const file = (type = 'image/webp', size = 500) => new File([new Uint8Array(size)], 'x', { type })
const category = (image_path: string | null = null) => ({ id: 'c1', slug: 'phones', image_path })

beforeEach(() => {
  calls.length = 0
  queue = []
  storage.upload.mockReset().mockResolvedValue({ data: {}, error: null })
  storage.remove.mockReset().mockResolvedValue({ data: [{}], error: null })
})

describe('saveCategoryImage', () => {
  it('uploads to categories/<slug>/<random>.<ext> in the public bucket, then points the category at it', async () => {
    const path = await saveCategoryImage(category(), file(), 'rand')
    expect(path).toBe('categories/phones/rand.webp')
    expect(named('storage.from')[0]).toEqual([CATEGORY_BUCKET])
    expect(storage.upload).toHaveBeenCalledWith('categories/phones/rand.webp', expect.any(File), { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
    expect(named('update')[0]).toEqual([{ image_path: 'categories/phones/rand.webp' }])
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('removes the previous picture file once the new one is in place', async () => {
    await saveCategoryImage(category('categories/phones/old.jpg'), file('image/jpeg'), 'new')
    expect(storage.remove).toHaveBeenCalledWith(['categories/phones/old.jpg'])
  })

  it('removes the uploaded file again when pointing the category at it fails, and keeps the old one', async () => {
    queue = [{ data: null, error: { code: '42501', message: 'denied' } }]
    await expect(saveCategoryImage(category('categories/phones/old.jpg'), file(), 'new')).rejects.toThrow()
    expect(storage.remove).toHaveBeenCalledTimes(1)
    expect(storage.remove).toHaveBeenCalledWith(['categories/phones/new.webp'])
  })

  it('treats "no row changed" as a failure and cleans up', async () => {
    queue = [{ data: [], error: null }]
    await expect(saveCategoryImage(category(), file(), 'r')).rejects.toThrow(/not applied/i)
    expect(storage.remove).toHaveBeenCalledWith(['categories/phones/r.webp'])
  })

  it.each([['image/gif', 1000, /JPEG, PNG or WebP/], ['image/png', 0, /empty/], ['image/png', 16 * 1024 * 1024, /larger than 15 MB/]])('refuses %s (%i bytes) before contacting Storage', async (type, size, message) => {
    await expect(saveCategoryImage(category(), file(type, size), 'r')).rejects.toThrow(message)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('refuses a picture that is still over 1 MB after the browser could not shrink it', async () => {
    await expect(saveCategoryImage(category(), file('image/png', 2 * 1024 * 1024), 'r')).rejects.toThrow(/still larger than 1 MB/)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('does not touch the category when the upload itself fails', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { name: 'StorageApiError', message: 'The object exceeded the maximum allowed size' } })
    await expect(saveCategoryImage(category(), file(), 'r')).rejects.toThrow()
    expect(named('update')).toHaveLength(0)
  })
})

describe('removeCategoryImage and categoryImageUrl', () => {
  it('clears image_path, then deletes the file', async () => {
    await removeCategoryImage(category('categories/phones/old.jpg'))
    expect(named('update')[0]).toEqual([{ image_path: null }])
    expect(storage.remove).toHaveBeenCalledWith(['categories/phones/old.jpg'])
  })
  it('gives the public address without any login', () => {
    expect(categoryImageUrl('categories/a/b.webp')).toBe('https://x.supabase.co/storage/v1/object/public/category-images/categories/a/b.webp')
  })
})
