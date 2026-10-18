import { describe, expect, it } from 'vitest'

// Read as raw text at test time (vite's ?raw), so no Node typings are needed in the browser project.
const files = import.meta.glob(['../../index.html', '../../public/_headers', '../../public/robots.txt'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const get = (name: string) => Object.entries(files).find(([p]) => p.endsWith(name))?.[1] ?? ''

describe('the CRM is never indexed by search engines', () => {
  it('index.html asks crawlers not to index or follow', () => {
    expect(get('index.html')).toMatch(/<meta name="robots" content="noindex, nofollow"/)
  })
  it('every response carries an X-Robots-Tag noindex header (Cloudflare Pages _headers)', () => {
    expect(get('_headers')).toMatch(/^\/\*\s*\r?\n\s+X-Robots-Tag: noindex, nofollow/m)
  })
  it('robots.txt exists and does not advertise a sitemap', () => {
    const robots = get('robots.txt')
    expect(robots).toMatch(/User-agent: \*/)
    expect(robots).not.toMatch(/^\s*sitemap:/im)
  })
})
