import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = [string, unknown[]]
const calls: Call[] = []
let queue: Array<{ data: unknown; error: unknown }> = []
const builder: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(queue.length > 0 ? queue.shift() : { data: [{ id: 'b1' }], error: null }).then(resolve)
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
  getPublicUrl: vi.fn((p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/brand-logos/${p}` } })),
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t: string) => (calls.push(['from', [t]]), builder), storage: { from: (b: string) => (calls.push(['storage.from', [b]]), storage) } },
}))

import { brandLogoUrl, LOGO_BUCKET, removeBrandLogo, saveBrandLogo } from './brandLogos'

const named = (name: string) => calls.filter(([n]) => n === name).map(([, a]) => a)
const file = (type = 'image/svg+xml', size = 500) => new File([new Uint8Array(size)], 'x', { type })
const brand = (logo_path: string | null = null) => ({ id: 'b1', slug: 'samsung', logo_path })

beforeEach(() => {
  calls.length = 0
  queue = []
  storage.upload.mockReset().mockResolvedValue({ data: {}, error: null })
  storage.remove.mockReset().mockResolvedValue({ data: [{}], error: null })
})

describe('saveBrandLogo', () => {
  it('uploads to brands/<slug>/<random>.<ext> in the public bucket, then points the brand at it', async () => {
    const path = await saveBrandLogo(brand(), file(), 'rand')
    expect(path).toBe('brands/samsung/rand.svg')
    expect(named('storage.from')[0]).toEqual([LOGO_BUCKET])
    expect(storage.upload).toHaveBeenCalledWith('brands/samsung/rand.svg', expect.any(File), { contentType: 'image/svg+xml', upsert: false, cacheControl: '31536000' })
    expect(named('update')[0]).toEqual([{ logo_path: 'brands/samsung/rand.svg' }])
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('removes the previous logo file once the new one is in place', async () => {
    await saveBrandLogo(brand('brands/samsung/old.png'), file('image/png'), 'new')
    expect(storage.remove).toHaveBeenCalledWith(['brands/samsung/old.png'])
  })

  it('removes the uploaded file again when pointing the brand at it fails, and keeps the old one', async () => {
    queue = [{ data: null, error: { code: '42501', message: 'denied' } }]
    await expect(saveBrandLogo(brand('brands/samsung/old.png'), file(), 'new')).rejects.toThrow()
    expect(storage.remove).toHaveBeenCalledTimes(1)
    expect(storage.remove).toHaveBeenCalledWith(['brands/samsung/new.svg'])
  })

  it('treats "no row changed" as a failure (the brand was deleted or hidden by RLS)', async () => {
    queue = [{ data: [], error: null }]
    await expect(saveBrandLogo(brand(), file(), 'r')).rejects.toThrow(/not applied/i)
    expect(storage.remove).toHaveBeenCalledWith(['brands/samsung/r.svg'])
  })

  it.each([['image/jpeg', 1000, /PNG or WebP/], ['image/png', 300 * 1024, /larger than 256 KB/], ['image/png', 0, /empty/]])('refuses %s (%i bytes) before contacting Storage', async (type, size, message) => {
    await expect(saveBrandLogo(brand(), file(type, size), 'r')).rejects.toThrow(message)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('does not touch the brand when the upload itself fails', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { name: 'StorageApiError', message: 'The object exceeded the maximum allowed size' } })
    await expect(saveBrandLogo(brand(), file(), 'r')).rejects.toThrow()
    expect(named('update')).toHaveLength(0)
  })
})

describe('removeBrandLogo and brandLogoUrl', () => {
  it('clears logo_path, then deletes the file', async () => {
    await removeBrandLogo(brand('brands/samsung/old.png'))
    expect(named('update')[0]).toEqual([{ logo_path: null }])
    expect(storage.remove).toHaveBeenCalledWith(['brands/samsung/old.png'])
  })
  it('gives the public address without any login', () => {
    expect(brandLogoUrl('brands/a/b.svg')).toBe('https://x.supabase.co/storage/v1/object/public/brand-logos/brands/a/b.svg')
  })
})
