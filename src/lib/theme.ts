import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
const KEY = 'crm-theme'
const ORDER: ThemeChoice[] = ['system', 'light', 'dark']

export const isThemeChoice = (v: unknown): v is ThemeChoice => v === 'system' || v === 'light' || v === 'dark'
export const nextTheme = (t: ThemeChoice): ThemeChoice => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]!

/** Storage can be blocked (private windows, site settings): every access is guarded and the app works without it. */
export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return isThemeChoice(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

/** `system` removes the attribute so the OS setting (prefers-color-scheme) applies; light and dark force it. */
export function applyTheme(t: ThemeChoice): void {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  try {
    if (t === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    /* not persisted; still applied for this visit */
  }
}

export function useTheme(): { theme: ThemeChoice; cycle: () => void } {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme)
  useEffect(() => applyTheme(theme), [theme])
  const cycle = useCallback(() => setTheme((t) => nextTheme(t)), [])
  return { theme, cycle }
}
