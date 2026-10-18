import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = [string, unknown[]]
const calls: Call[] = []
const order: string[] = []
let queue: Array<{ data: unknown; error: unknown }> = []
let fallback: { data: unknown; error: unknown } = { data: [], error: null }
const builder: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(queue.length > 0 ? queue.shift() : fallback).then(resolve)
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
  getPublicUrl: vi.fn((p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/product-images/${p}` } })),
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t: string) => (calls.push(['from', [t]]), order.push(`from:${t}`), builder), storage: { from: (b: string) => (calls.push(['storage.from', [b]]), storage) } },
}))

import { addSpec, BUCKET, deletePhoto, deleteSpec, listImages, listSpecs, photoUrl, setPrimaryPhoto, swapPhotoOrder, updateImageAlt, updateSpec, uploadPhoto } from './productMedia'
import { NO_ROWS_MESSAGE } from './db'
import type { ProductImage } from '../lib/types'

const named = (name: string) => calls.filter(([n]) => n === name).map(([, a]) => a)
const file = (type = 'image/png', size = 1000) => new File([new Uint8Array(size)], 'x.png', { type })
const img = (id: string, order = 0): ProductImage => ({ id, product_id: 'p1', storage_path: `products/p1/${id}.png`, alt_text: '', sort_order: order, is_primary: false, created_at: '2026-01-01' })

beforeEach(() => {
  calls.length = 0
  order.length = 0
  queue = []
  fallback = { data: [], error: null }
  storage.upload.mockReset().mockResolvedValue({ data: {}, error: null })
  storage.remove.mockReset().mockResolvedValue({ data: [{}], error: null })
})

describe('uploadPhoto', () => {
  it('uploads to products/<id>/<random>.<ext> in the public bucket, then registers the row', async () => {
    queue = [{ data: [], error: null }, { data: { id: 'i1' }, error: null }] // last sort_order lookup, then the insert
    await uploadPhoto('p1', file('image/png'), '  Front  ', true, 'rand')
    expect(named('storage.from')[0]).toEqual([BUCKET])
    expect(storage.upload).toHaveBeenCalledWith('products/p1/rand.png', expect.any(File), { contentType: 'image/png', upsert: false, cacheControl: '31536000' })
    expect(named('insert')[0]).toEqual([{ product_id: 'p1', storage_path: 'products/p1/rand.png', alt_text: 'Front', sort_order: 0, is_primary: true }])
  })
  it('the next photo goes after the last one and is not primary', async () => {
    queue = [{ data: [{ sort_order: 4 }], error: null }, { data: { id: 'i2' }, error: null }]
    await uploadPhoto('p1', file('image/jpeg'), '', false, 'r2')
    expect(named('insert')[0]).toEqual([{ product_id: 'p1', storage_path: 'products/p1/r2.jpg', alt_text: '', sort_order: 5, is_primary: false }])
  })
  it.each([['image/gif', 1000, /JPEG, PNG or WebP/], ['image/png', 3 * 1024 * 1024, /larger than 2 MB/], ['image/png', 0, /empty/]])('refuses %s (%i bytes) before contacting Storage', async (type, size, message) => {
    await expect(uploadPhoto('p1', file(type, size), '', true, 'r')).rejects.toThrow(message)
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('translates a Storage refusal and registers nothing', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { name: 'StorageApiError', message: 'new row violates row-level security policy', status: 403, statusCode: '403' } })
    await expect(uploadPhoto('p1', file(), '', true, 'r')).rejects.toThrow(/permission/i)
    expect(named('insert')).toHaveLength(0)
  })
  it('removes the uploaded file again when the row cannot be created', async () => {
    queue = [{ data: [], error: null }, { data: null, error: { code: '23503', message: 'insert or update on table "product_images" violates foreign key constraint "x"' } }]
    await expect(uploadPhoto('p1', file(), '', true, 'orphan')).rejects.toThrow(/no longer exists/)
    expect(storage.remove).toHaveBeenCalledWith(['products/p1/orphan.png'])
  })
})

describe('reading', () => {
  it('lists specs and photos of one product in order', async () => {
    await listSpecs('p1')
    expect(named('eq')).toContainEqual(['product_id', 'p1'])
    expect(named('order')).toEqual([['sort_order'], ['spec_key']])
    calls.length = 0
    await listImages('p1')
    expect(named('from')).toEqual([['product_images']])
  })
  it('builds the public URL from the Storage client', () => {
    expect(photoUrl('products/p1/a.png')).toBe('https://x.supabase.co/storage/v1/object/public/product-images/products/p1/a.png')
  })
})

describe('changing photos', () => {
  it('making a photo primary clears the old primary first (only one is allowed), then sets the new one', async () => {
    queue = [{ data: null, error: null }, { data: [{ id: 'i2' }], error: null }]
    await setPrimaryPhoto('p1', 'i2')
    expect(named('update')).toEqual([[{ is_primary: false }], [{ is_primary: true }]])
    expect(named('eq')).toContainEqual(['is_primary', true])
  })
  it('swapping order updates both photos', async () => {
    fallback = { data: [{ id: 'x' }], error: null }
    await swapPhotoOrder(img('a', 0), img('b', 1))
    expect(named('update')).toEqual([[{ sort_order: 1 }], [{ sort_order: 0 }]])
  })
  it('description changes are checked for zero rows', async () => {
    fallback = { data: [], error: null }
    await expect(updateImageAlt('a', 'x')).rejects.toThrow(NO_ROWS_MESSAGE)
  })
  it('deleting removes the row first and then the file', async () => {
    fallback = { data: [{ id: 'a' }], error: null }
    storage.remove.mockImplementation(async () => { order.push('storage.remove'); return { data: [{}], error: null } })
    await deletePhoto(img('a'))
    expect(order).toEqual(['from:product_images', 'storage.remove'])
    expect(storage.remove).toHaveBeenCalledWith(['products/p1/a.png'])
  })
  it('if the row cannot be deleted the file is kept (the photo is still on the website)', async () => {
    fallback = { data: [], error: null }
    await expect(deletePhoto(img('a'))).rejects.toThrow(NO_ROWS_MESSAGE)
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it('a failing file delete after the row is gone does not fail the action', async () => {
    fallback = { data: [{ id: 'a' }], error: null }
    storage.remove.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(deletePhoto(img('a'))).resolves.toBeUndefined()
  })
})

describe('specifications', () => {
  it('adds with the product id; edits and deletes are checked', async () => {
    fallback = { data: null, error: null }
    await addSpec('p1', { group_name: 'Display', spec_key: 'Size', spec_value: '6.5', sort_order: 1 })
    expect(named('insert')[0]).toEqual([{ product_id: 'p1', group_name: 'Display', spec_key: 'Size', spec_value: '6.5', sort_order: 1 }])
    fallback = { data: [], error: null }
    await expect(updateSpec('s1', { group_name: 'D', spec_key: 'k', spec_value: 'v', sort_order: 0 })).rejects.toThrow(NO_ROWS_MESSAGE)
    await expect(deleteSpec('s1')).rejects.toThrow(NO_ROWS_MESSAGE)
  })
})
