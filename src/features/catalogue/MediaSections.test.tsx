import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotosSection } from './PhotosSection'
import { SpecsSection } from './SpecsSection'
import { readyState, renderApp } from '../../test/utils'
import * as media from '../../api/productMedia'
import { AppError } from '../../lib/errors'
import { NO_ROWS_MESSAGE } from '../../api/db'
import type { ProductImage, ProductSpec } from '../../lib/types'

vi.mock('../../api/productMedia')

const image = (id: string, order: number, over: Partial<ProductImage> = {}): ProductImage => ({ id, product_id: 'p1', storage_path: `products/p1/${id}.png`, alt_text: `Photo ${id}`, sort_order: order, is_primary: false, created_at: `2026-01-0${order + 1}`, ...over })
const spec = (id: string, group: string, key: string, value: string, order = 0): ProductSpec => ({ id, product_id: 'p1', group_name: group, spec_key: key, spec_value: value, sort_order: order })
const png = (name = 'front.png', type = 'image/png', size = 100) => new File([new Uint8Array(size)], name, { type })

const showPhotos = () => renderApp(<PhotosSection productId="p1" />, { state: readyState('manager') })
const showSpecs = () => renderApp(<SpecsSection productId="p1" />, { state: readyState('manager') })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  vi.mocked(media.photoUrl).mockImplementation((p) => `https://x.supabase.co/storage/v1/object/public/product-images/${p}`)
  vi.mocked(media.listImages).mockResolvedValue([])
  vi.mocked(media.listSpecs).mockResolvedValue([])
})

describe('PhotosSection', () => {
  it('shows an empty state that says what the website does without photos', async () => {
    showPhotos()
    expect(await screen.findByText(/No photos yet\. The website shows a placeholder/)).toBeInTheDocument()
    expect(screen.getByText(/Photos are public/)).toBeInTheDocument()
  })

  it('lists photos in order with the main one marked and the public address of each', async () => {
    vi.mocked(media.listImages).mockResolvedValue([image('b', 1), image('a', 0, { is_primary: true })])
    showPhotos()
    const grid = await screen.findByRole('list', { name: 'Product photos' })
    const items = within(grid).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Main photo')).toBeInTheDocument()
    expect(within(items[0]!).getByRole('img')).toHaveAttribute('src', 'https://x.supabase.co/storage/v1/object/public/product-images/products/p1/a.png')
    expect(within(items[1]!).queryByText('Main photo')).not.toBeInTheDocument()
  })

  it('uploads the first photo as the main photo and says so after the server confirmed it', async () => {
    vi.mocked(media.uploadPhoto).mockResolvedValue(image('n', 0, { is_primary: true }))
    const user = userEvent.setup()
    showPhotos()
    await screen.findByText(/No photos yet/)
    await user.upload(screen.getByLabelText('Photo'), png())
    expect(await screen.findByAltText('Preview of the chosen photo')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Description (optional)'), 'Front view')
    await user.click(screen.getByRole('button', { name: 'Upload photo' }))
    await waitFor(() => expect(media.uploadPhoto).toHaveBeenCalledTimes(1))
    const [productId, file, alt, isFirst, random] = vi.mocked(media.uploadPhoto).mock.calls[0]!
    expect([productId, (file as File).name, alt, isFirst]).toEqual(['p1', 'front.png', 'Front view', true])
    expect(random.length).toBeGreaterThan(10)
    expect(await screen.findByText('Photo uploaded')).toBeInTheDocument()
  })

  it('a later photo is not sent as the first one', async () => {
    vi.mocked(media.listImages).mockResolvedValue([image('a', 0, { is_primary: true })])
    vi.mocked(media.uploadPhoto).mockResolvedValue(image('b', 1))
    const user = userEvent.setup()
    showPhotos()
    await screen.findByRole('list', { name: 'Product photos' })
    await user.upload(screen.getByLabelText('Photo'), png('side.png'))
    await user.click(screen.getByRole('button', { name: 'Upload photo' }))
    await waitFor(() => expect(media.uploadPhoto).toHaveBeenCalled())
    expect(vi.mocked(media.uploadPhoto).mock.calls[0]![3]).toBe(false)
  })

  it('refuses a GIF, an oversized file and no file, without contacting the server', async () => {
    const user = userEvent.setup({ applyAccept: false })
    showPhotos()
    await screen.findByText(/No photos yet/)
    await user.click(screen.getByRole('button', { name: 'Upload photo' }))
    expect(await screen.findByText('Choose a photo first.')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Photo'), png('x.gif', 'image/gif'))
    expect(await screen.findByText('Use a JPEG, PNG or WebP photo.')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Photo'), png('big.png', 'image/png', 2 * 1024 * 1024 + 1))
    expect(await screen.findByText(/larger than 2 MB/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Upload photo' }))
    expect(media.uploadPhoto).not.toHaveBeenCalled()
  })

  it('shows the server reason when an upload fails and does not claim success', async () => {
    vi.mocked(media.uploadPhoto).mockRejectedValue(new AppError('You do not have permission to do that.', 'storage'))
    const user = userEvent.setup()
    showPhotos()
    await screen.findByText(/No photos yet/)
    await user.upload(screen.getByLabelText('Photo'), png())
    await user.click(screen.getByRole('button', { name: 'Upload photo' }))
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument()
    expect(screen.queryByText('Photo uploaded')).not.toBeInTheDocument()
  })

  it('makes a photo the main one, moves photos, and disables moves at the ends', async () => {
    vi.mocked(media.listImages).mockResolvedValue([image('a', 0, { is_primary: true }), image('b', 1)])
    vi.mocked(media.setPrimaryPhoto).mockResolvedValue(undefined)
    vi.mocked(media.swapPhotoOrder).mockResolvedValue(undefined)
    const user = userEvent.setup()
    showPhotos()
    await screen.findByRole('list', { name: 'Product photos' })
    expect(screen.getByRole('button', { name: 'Move photo 1 earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move photo 2 later' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Make photo 1 the main photo' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Make photo 2 the main photo' }))
    await waitFor(() => expect(media.setPrimaryPhoto).toHaveBeenCalledWith('p1', 'b'))
    await user.click(screen.getByRole('button', { name: 'Move photo 2 earlier' }))
    await waitFor(() => expect(media.swapPhotoOrder).toHaveBeenCalledTimes(1))
    expect(vi.mocked(media.swapPhotoOrder).mock.calls[0]!.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('saves a changed description only when it changed and is valid', async () => {
    vi.mocked(media.listImages).mockResolvedValue([image('a', 0)])
    vi.mocked(media.updateImageAlt).mockResolvedValue(undefined)
    const user = userEvent.setup()
    showPhotos()
    const save = await screen.findByRole('button', { name: 'Save description of photo 1' })
    expect(save).toBeDisabled()
    const alt = screen.getByLabelText('Description of photo 1')
    await user.clear(alt)
    await user.type(alt, 'Black, front')
    await user.click(save)
    await waitFor(() => expect(media.updateImageAlt).toHaveBeenCalledWith('a', 'Black, front'))
  })

  it('deletes after confirmation; declining deletes nothing; a refused delete is shown', async () => {
    vi.mocked(media.listImages).mockResolvedValue([image('a', 0)])
    vi.mocked(media.deletePhoto).mockRejectedValueOnce(new AppError(NO_ROWS_MESSAGE, 'no_rows')).mockResolvedValue(undefined)
    const user = userEvent.setup()
    showPhotos()
    const del = await screen.findByRole('button', { name: 'Delete photo 1' })
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await user.click(del)
    expect(media.deletePhoto).not.toHaveBeenCalled()
    await user.click(del)
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete photo 1' }))
    expect(await screen.findByText('Photo deleted')).toBeInTheDocument()
  })
})

describe('SpecsSection', () => {
  it('shows specifications grouped, and an empty state', async () => {
    const { unmount } = showSpecs()
    expect(await screen.findByText('No specifications yet.')).toBeInTheDocument()
    unmount()
    vi.mocked(media.listSpecs).mockResolvedValue([spec('1', 'Display', 'Screen size', '6.5 inch AMOLED', 1), spec('2', 'Battery', 'Capacity', '5000 mAh', 5), spec('3', 'Display', 'Refresh rate', '120 Hz', 2)])
    showSpecs()
    const display = await screen.findByRole('table', { name: 'Display specifications' })
    expect(within(display).getAllByRole('row').map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Screen size6.5 inch AMOLED'), expect.stringContaining('Refresh rate120 Hz')]))
    expect(screen.getByRole('table', { name: 'Battery specifications' })).toHaveTextContent('5000 mAh')
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Display', 'Battery'])
  })

  it('validates, then adds a specification', async () => {
    vi.mocked(media.addSpec).mockResolvedValue(undefined)
    const user = userEvent.setup()
    showSpecs()
    await user.click(await screen.findByRole('button', { name: 'Add specification' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Enter the name of the specification/)).toBeInTheDocument()
    expect(await screen.findByText(/Enter its value/)).toBeInTheDocument()
    expect(media.addSpec).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Group'))
    await user.type(screen.getByLabelText('Group'), 'Camera')
    await user.type(screen.getByLabelText('Name'), 'Main camera')
    await user.type(screen.getByLabelText('Value'), '50 MP')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(media.addSpec).toHaveBeenCalledWith('p1', { group_name: 'Camera', spec_key: 'Main camera', spec_value: '50 MP', sort_order: 0 }))
  })

  it('edits, shows a duplicate in plain words, and deletes after confirmation', async () => {
    vi.mocked(media.listSpecs).mockResolvedValue([spec('1', 'Display', 'Screen size', '6.5 inch', 1)])
    vi.mocked(media.updateSpec).mockRejectedValueOnce(new AppError('This product already has a specification with that name in that group. Edit the existing one instead.', '23505')).mockResolvedValue(undefined)
    vi.mocked(media.deleteSpec).mockResolvedValue(undefined)
    const user = userEvent.setup()
    showSpecs()
    await user.click(await screen.findByRole('button', { name: 'Edit Screen size' }))
    const value = screen.getByLabelText('Value')
    await user.clear(value)
    await user.type(value, '6.7 inch')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/already has a specification with that name/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(media.updateSpec).toHaveBeenLastCalledWith('1', expect.objectContaining({ spec_value: '6.7 inch', spec_key: 'Screen size' })))
    await user.click(await screen.findByRole('button', { name: 'Delete Screen size' }))
    await waitFor(() => expect(media.deleteSpec).toHaveBeenCalledWith('1'))
  })
})
