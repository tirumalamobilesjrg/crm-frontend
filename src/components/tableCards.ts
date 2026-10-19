/**
 * On a phone-width screen a table with a header row is drawn as one card per row (see `.table.row-cards` in styles.css), with each
 * cell carrying its column name. This marks such tables and copies each header's text onto the cells below it as `data-label`.
 * Invoice lines are left alone (they must print as a table); rows that span columns (empty-state messages) get no labels.
 */
export function labelTables(root: ParentNode) {
  root.querySelectorAll('table.table:not(.invoice-lines)').forEach((table) => {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '')
    if (heads.length === 0) return
    table.classList.add('row-cards')
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = Array.from(row.children)
      if (cells.length !== heads.length) return
      cells.forEach((cell, i) => {
        if (cell.tagName === 'TD' && heads[i] && cell.getAttribute('data-label') !== heads[i]) cell.setAttribute('data-label', heads[i]!)
      })
    })
  })
}

/** Keeps `root` labelled as screens render and re-render tables inside it. Returns a function that stops watching. */
export function watchTables(root: HTMLElement) {
  labelTables(root)
  let frame = 0
  const observer = new MutationObserver(() => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      labelTables(root)
    })
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
}
