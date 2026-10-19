import { useId, useMemo, useState } from 'react'
import { formatINR } from '../../lib/money'
import type { SellableAccessory, SellableDevice } from '../../lib/types'
import { findItems, type FoundItem } from './findItems'
import type { CartLine } from './logic'

/** Type a model, colour, storage or the last digits of an IMEI and pick the item: for counters without a scanner. */
export function FindItemBox({ devices, accessories, cart, loading, failed, onPick }: {
  devices: SellableDevice[]
  accessories: SellableAccessory[]
  cart: CartLine[]
  loading: boolean
  failed: boolean
  onPick: (item: FoundItem) => void
}) {
  const [term, setTerm] = useState('')
  const id = useId()
  const { items, total } = useMemo(() => findItems(devices, accessories, term, cart), [devices, accessories, term, cart])
  const searching = term.trim().length >= 2

  function pick(item: FoundItem) {
    onPick(item)
    setTerm('')
  }

  return (
    <div className="find-item">
      <label htmlFor={id}>Find an item to sell</label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder={loading ? 'Loading stock…' : 'Type a model, colour, storage or IMEI digits, e.g. nova 128 black'}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items.length >= 1) {
            e.preventDefault()
            pick(items[0]!)
          }
        }}
        aria-describedby={`${id}-help`}
      />
      <small id={`${id}-help`} className="hint">
        {failed ? 'Stock could not be loaded. Scan the IMEI instead, or reload the page.' : 'Press Enter to add the first result, or choose one below.'}
      </small>
      <div aria-live="polite" className="sr-only">
        {searching ? `${total} ${total === 1 ? 'match' : 'matches'}` : ''}
      </div>
      {searching && items.length === 0 && !loading && <p className="muted">No phone or accessory in stock matches “{term.trim()}”.</p>}
      {items.length > 0 && (
        <ul className="find-results" aria-label="Matching items">
          {items.map((i) => (
            <li key={i.key}>
              <button type="button" className="find-result" onClick={() => pick(i)}>
                <span className="find-title">{i.title}</span>
                <span className="muted">{i.detail}</span>
                <span className="find-price">{formatINR(i.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > items.length && <p className="muted small">Showing {items.length} of {total}. Type more to narrow the list.</p>}
    </div>
  )
}
