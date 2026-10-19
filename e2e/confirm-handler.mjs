/**
 * The CRM asks for confirmation with its own dialog (`.confirm-dialog`), not window.confirm. This answers it from a script:
 * `decide()` returns true to confirm or false to cancel, and `seen(message)` is told what was asked.
 */
export async function handleConfirmDialogs(page, { decide, seen = () => {} }) {
  await page.exposeFunction('__confirmDecision', async () => decide())
  await page.exposeFunction('__confirmSeen', async (message) => seen(message))
  const install = `(() => {
    if (window.__confirmWatching) return
    window.__confirmWatching = true
    new MutationObserver(async () => {
      const dialog = document.querySelector('.confirm-dialog')
      if (!dialog || dialog.hasAttribute('data-answered')) return
      dialog.setAttribute('data-answered', 'true')
      await window.__confirmSeen(dialog.querySelector('p')?.textContent ?? '')
      const ok = await window.__confirmDecision()
      const buttons = dialog.querySelectorAll('.dialog-actions button')
      ;(ok ? buttons[buttons.length - 1] : buttons[0])?.click()
    }).observe(document, { childList: true, subtree: true })
  })()`
  await page.addInitScript(install)
  await page.evaluate(install)
}
