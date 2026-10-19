import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupPage } from './SetupPage'
import { autoConfirm, readyState, renderApp } from '../../test/utils'
import * as api from '../../api/catalogue'
import * as logos from '../../api/brandLogos'
import * as pictures from '../../api/categoryImages'
import { AppError } from '../../lib/errors'
import type { Brand } from '../../lib/types'

vi.mock('../../api/catalogue')
vi.mock('../../api/brandLogos')
vi.mock('../../api/categoryImages')

const brand = (over: Partial<Brand> = {}): Brand => ({ id: 'b1', name: 'Samsung', slug: 'samsung', is_active: true, logo_path: null, ...over })

// Loading a gallery logo is a dynamic import, which is slow the first time when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 25_000 })
beforeAll(() => configure({ asyncUtilTimeout: 12000 }))
afterAll(() => configure({ asyncUtilTimeout: 1000 }))
const until = (check: () => void) => vi.waitFor(check, { timeout: 12000 })

beforeEach(() => {
  vi.resetAllMocks()
  autoConfirm()
  vi.mocked(api.listBrands).mockResolvedValue([brand({ logo_path: 'brands/samsung/a.svg' }), brand({ id: 'b2', name: 'Zed', slug: 'zed' })])
  vi.mocked(api.listCategories).mockResolvedValue([{ id: 'c1', name: 'Phones', slug: 'phones', is_active: true, image_path: 'categories/phones/a.webp' }, { id: 'c2', name: 'Cases', slug: 'cases', is_active: true, image_path: null }])
  vi.mocked(api.createBrand).mockImplementation(async (i) => brand({ id: 'new', name: i.name, slug: i.slug }) as never)
  vi.mocked(logos.brandLogoUrl).mockImplementation((p) => `https://x.supabase.co/${p}`)
  vi.mocked(logos.saveBrandLogo).mockResolvedValue('brands/x/y.svg')
  vi.mocked(logos.removeBrandLogo).mockResolvedValue(undefined)
  vi.mocked(pictures.categoryImageUrl).mockImplementation((p) => `https://x.supabase.co/cat/${p}`)
  vi.mocked(pictures.saveCategoryImage).mockResolvedValue('categories/x/y.webp')
  vi.mocked(pictures.removeCategoryImage).mockResolvedValue(undefined)
})

const show = () => renderApp(<SetupPage />, { state: readyState('manager') })

describe('Brands & categories: logos', () => {
  it('shows each brand with its logo, or its first letter when it has none; categories have no logo controls', async () => {
    show()
    const row = (await screen.findByText('Samsung')).closest('tr')!
    expect(row.querySelector('img')).toHaveAttribute('src', 'https://x.supabase.co/brands/samsung/a.svg')
    const zed = screen.getByText('Zed').closest('tr')!
    expect(zed.querySelector('img')).toBeNull()
    expect(within(zed).getByText('Z')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Logo for / })).toHaveLength(2)
    expect(screen.getByLabelText('New category name')).toBeInTheDocument()
  })

  it('suggests the gallery logo when the typed name is a known brand, and uploads it after the brand is created', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Samsung')
    await user.type(screen.getByLabelText('New brand name'), 'realme')
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument() // a logo is already chosen for it
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await until(() => expect(logos.saveBrandLogo).toHaveBeenCalledTimes(1))
    const [target, file] = vi.mocked(logos.saveBrandLogo).mock.calls[0]!
    expect(target).toEqual({ id: 'new', slug: 'realme', logo_path: null })
    expect(file.type).toBe('image/svg+xml')
    expect(file.name).toBe('realme.svg')
    expect(await screen.findByText('Brand added')).toBeInTheDocument()
  })

  it('lets staff pick a different gallery logo for a new brand with the search box', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Samsung')
    await user.type(screen.getByLabelText('New brand name'), 'My Phone Co')
    expect(screen.getByRole('button', { name: 'Choose logo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose logo' }))
    await user.type(screen.getByLabelText(/Search the gallery/), 'itel')
    const group = screen.getByRole('group', { name: 'Brand logos' })
    expect(within(group).getAllByRole('button')).toHaveLength(1)
    await user.click(within(group).getByRole('button', { name: /itel/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await until(() => expect(logos.saveBrandLogo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(logos.saveBrandLogo).mock.calls[0]![1].name).toBe('itel.svg')
  })

  it('a brand with no gallery match is added without a logo; uploading refuses a JPEG and accepts a PNG', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Samsung')
    await user.type(screen.getByLabelText('New brand name'), 'Local Brand')
    await user.click(screen.getByRole('button', { name: 'Choose logo' }))
    const input = screen.getByLabelText(/upload your own/i)
    await userEvent.setup({ applyAccept: false }).upload(input, new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG or WebP/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.upload(input, new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await until(() => expect(logos.saveBrandLogo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(logos.saveBrandLogo).mock.calls[0]![1].name).toBe('a.png')
  })

  it('adds the brand and says so when only its logo could not be saved', async () => {
    vi.mocked(logos.saveBrandLogo).mockRejectedValue(new AppError('That logo is larger than 256 KB.', 'invalid_logo'))
    const user = userEvent.setup()
    show()
    await screen.findByText('Samsung')
    await user.type(screen.getByLabelText('New brand name'), 'oppo')
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    expect(await screen.findByText(/Brand added, but its logo could not be saved: That logo is larger than 256 KB/)).toBeInTheDocument()
    expect(api.createBrand).toHaveBeenCalledTimes(1)
  })

  it('changes the logo of an existing brand and removes it again', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Logo for Zed' }))
    expect(screen.queryByRole('button', { name: 'Remove logo' })).not.toBeInTheDocument() // Zed has none
    await user.click(within(screen.getByRole('group', { name: 'Brand logos' })).getByRole('button', { name: /Nokia/ }))
    await until(() => expect(logos.saveBrandLogo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(logos.saveBrandLogo).mock.calls[0]![0]).toEqual({ id: 'b2', slug: 'zed', logo_path: null })
    expect(await screen.findByText('Logo saved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Logo for Samsung' }))
    await user.click(screen.getByRole('button', { name: 'Remove logo' }))
    await until(() => expect(logos.removeBrandLogo).toHaveBeenCalledWith({ id: 'b1', logo_path: 'brands/samsung/a.svg' }))
    expect(await screen.findByText('Logo removed')).toBeInTheDocument()
  })

  it('shows the reason when changing a logo fails and keeps the dialog open', async () => {
    vi.mocked(logos.saveBrandLogo).mockRejectedValue(new AppError('You do not have permission to do that.', '42501'))
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Logo for Zed' }))
    await user.click(within(screen.getByRole('group', { name: 'Brand logos' })).getByRole('button', { name: /Nokia/ }))
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not wipe the next name that is being typed while the previous brand logo is still uploading', async () => {
    let finish!: (v: string) => void
    vi.mocked(logos.saveBrandLogo).mockReturnValue(new Promise<string>((r) => (finish = r)))
    const user = userEvent.setup()
    show()
    await screen.findByText('Samsung')
    const field = screen.getByLabelText('New brand name')
    await user.type(field, 'realme')
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    await until(() => expect(logos.saveBrandLogo).toHaveBeenCalled())
    await user.clear(field)
    await user.type(field, 'Tecno')
    finish('brands/realme/x.svg')
    expect(await screen.findByText('Brand added')).toBeInTheDocument()
    expect(field).toHaveValue('Tecno')
  })

  it('shows each category with its picture (or its first letter) and a Picture button; brands get no picture button', async () => {
    show()
    const phones = (await screen.findByText('Phones')).closest('tr')!
    expect(phones.querySelector('img')).toHaveAttribute('src', 'https://x.supabase.co/cat/categories/phones/a.webp')
    const cases = screen.getByText('Cases').closest('tr')!
    expect(cases.querySelector('img')).toBeNull()
    expect(within(cases).getByText('C')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Picture for / })).toHaveLength(2)
  })

  it('chooses a picture for a category, refuses a GIF, and removes a picture', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Picture for Cases' }))
    expect(screen.queryByRole('button', { name: 'Remove picture' })).not.toBeInTheDocument()
    const input = screen.getByLabelText(/Choose a picture/)
    await userEvent.setup({ applyAccept: false }).upload(input, new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/)
    expect(pictures.saveCategoryImage).not.toHaveBeenCalled()
    await user.upload(input, new File([new Uint8Array(10)], 'a.webp', { type: 'image/webp' }))
    await until(() => expect(pictures.saveCategoryImage).toHaveBeenCalledTimes(1))
    expect(vi.mocked(pictures.saveCategoryImage).mock.calls[0]![0]).toEqual({ id: 'c2', slug: 'cases', image_path: null })
    expect(await screen.findByText('Picture saved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Picture for Phones' }))
    await user.click(screen.getByRole('button', { name: 'Remove picture' }))
    await until(() => expect(pictures.removeCategoryImage).toHaveBeenCalledWith({ id: 'c1', slug: 'phones', image_path: 'categories/phones/a.webp' }))
    expect(await screen.findByText('Picture removed')).toBeInTheDocument()
  })

  it('shows the reason when a picture cannot be saved and keeps the dialog open', async () => {
    vi.mocked(pictures.saveCategoryImage).mockRejectedValue(new AppError('That picture is still larger than 1 MB after shrinking.', 'invalid_picture'))
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Picture for Cases' }))
    await user.upload(screen.getByLabelText(/Choose a picture/), new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))
    expect(await screen.findByText(/still larger than 1 MB/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
