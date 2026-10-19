import { describe, expect, it } from 'vitest'
import { CURATED_LOGOS, loadCuratedLogo, loadLogoPreview, logoPath, matchLogos, MAX_LOGO_BYTES, suggestLogo, validateLogoFile } from './logoGallery'

describe('curated gallery', () => {
  it('has the phone brands the shop sells, including the ones from Wikimedia Commons', () => {
    const names = CURATED_LOGOS.map((l) => l.name)
    for (const n of ['Samsung', 'Apple', 'Xiaomi', 'OnePlus', 'OPPO', 'vivo', 'realme', 'iQOO', 'Nothing', 'POCO', 'Redmi', 'Tecno', 'Infinix', 'itel', 'Lava', 'Micromax']) expect(names).toContain(n)
  })

  it('has a unique, URL-safe slug for every logo, and a file behind each one', async () => {
    const slugs = CURATED_LOGOS.map((l) => l.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+$/)
      expect(await loadLogoPreview(slug)).toBeTruthy()
    }
  })

  it('every bundled logo is a safe SVG under the bucket limit: no scripts, event handlers, links or external references', async () => {
    for (const { slug } of CURATED_LOGOS) {
      const file = await loadCuratedLogo(slug)
      expect(file.type).toBe('image/svg+xml')
      expect(file.size, slug).toBeGreaterThan(0)
      expect(file.size, slug).toBeLessThanOrEqual(MAX_LOGO_BYTES)
      const text = await file.text()
      expect(text, slug).toMatch(/<svg[\s>]/)
      expect(text, slug).toMatch(/viewBox=/)
      expect(text, slug).not.toMatch(/<script|foreignObject|<style|<image|<a[\s>]|\son\w+=|javascript:|xlink:href|\shref=|url\(/i)
      expect(text.replace(/xmlns(:\w+)?="[^"]*"/g, ''), slug).not.toMatch(/https?:\/\//)
    }
  })

  it('rejects asking for a logo that is not in the gallery', async () => {
    await expect(loadCuratedLogo('nope')).rejects.toThrow()
    await expect(loadLogoPreview('nope')).rejects.toThrow()
  })
})

describe('matchLogos and suggestLogo', () => {
  it('lists everything for an empty search', () => {
    expect(matchLogos('  ')).toHaveLength(CURATED_LOGOS.length)
  })
  it('ignores case, spaces and punctuation', () => {
    expect(matchLogos('one plus').map((l) => l.name)).toContain('OnePlus')
    expect(matchLogos('TP link').map((l) => l.name)).toContain('TP-Link')
    expect(matchLogos('sam').map((l) => l.name)).toEqual(['Samsung'])
    expect(matchLogos('zzzz')).toEqual([])
  })
  it('suggests a logo only when the typed name is exactly a gallery brand', () => {
    expect(suggestLogo('samsung')?.slug).toBe('samsung')
    expect(suggestLogo(' Real Me ')?.slug).toBe('realme')
    expect(suggestLogo('Sam')).toBeUndefined()
    expect(suggestLogo('')).toBeUndefined()
  })
})

describe('uploading', () => {
  it.each([
    ['image/png', 1000, null],
    ['image/webp', MAX_LOGO_BYTES, null],
    ['image/svg+xml', 500, null],
    ['image/jpeg', 1000, /PNG or WebP/],
    ['image/gif', 1000, /PNG or WebP/],
    ['image/png', 0, /empty/],
    ['image/png', MAX_LOGO_BYTES + 1, /larger than 256 KB/],
  ])('%s of %i bytes', (type, size, expected) => {
    const problem = validateLogoFile({ type, size })
    if (expected === null) expect(problem).toBeNull()
    else expect(problem).toMatch(expected)
  })
  it('asks for a file when none is chosen', () => {
    expect(validateLogoFile(null)).toMatch(/Choose a logo/)
  })
  it('names the object brands/<slug>/<random>.<ext>', () => {
    expect(logoPath('samsung', 'image/svg+xml', 'abc')).toBe('brands/samsung/abc.svg')
    expect(logoPath('x', 'image/png', 'r')).toBe('brands/x/r.png')
    expect(logoPath('x', 'image/webp', 'r')).toBe('brands/x/r.webp')
  })
})
