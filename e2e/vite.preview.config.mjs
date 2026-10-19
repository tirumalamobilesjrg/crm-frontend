// Used only by `vite preview` in the browser smoke test (see run.mjs): serves the built app with the production
// Content-Security-Policy from public/_headers, plus the local stand-in server, so a blocked script, style, image or
// request fails the smoke test instead of the live site.
import { readFileSync } from 'node:fs'

const policy = /Content-Security-Policy: (.*)/.exec(readFileSync('public/_headers', 'utf8'))?.[1]?.trim()
if (!policy) throw new Error('No Content-Security-Policy found in public/_headers')

export default {
  preview: {
    headers: { 'Content-Security-Policy': policy.replace('connect-src', 'connect-src http://127.0.0.1:*').replace('img-src', 'img-src http://127.0.0.1:*') },
  },
}
