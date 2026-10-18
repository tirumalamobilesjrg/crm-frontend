import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * While `active`: moves focus into the container, keeps Tab / Shift+Tab inside it, calls `onEscape` on Escape, and gives focus back
 * to whatever had it before when it deactivates. Used by dialogs and the mobile navigation drawer.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  useEffect(() => {
    const el = ref.current
    if (!active || !el) return
    const previous = document.activeElement as HTMLElement | null
    const visible = (n: HTMLElement) => { const st = getComputedStyle(n); return !n.hidden && st.display !== 'none' && st.visibility !== 'hidden' }
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible)
    // focus the first field if there is one, otherwise the first control
    const first = el.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? items()[0]
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape?.()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      if (list.length === 0) return e.preventDefault()
      const head = list[0]!
      const tail = list[list.length - 1]!
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus() }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus() }
      else if (!el.contains(document.activeElement)) { e.preventDefault(); head.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
    // onEscape is read through a ref-like closure on every key press; re-running the effect would steal focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref])
}
