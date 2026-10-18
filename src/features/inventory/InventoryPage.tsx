import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { listAccessories, listDevices, listVariantIndex, loadInventorySummary, PAGE_SIZE } from '../../api/inventory'
import type { InventoryStatus } from '../../lib/types'
import { Badge, Button, ErrorBox, Loading, Pagination } from '../../components/ui'
import { CONDITION_LABEL, matchVariantIds, pageCount, sanitizeSearch, STATUSES, STATUS_LABEL, STATUS_TONE, variantTitle } from './logic'

type Tab = 'devices' | 'accessories'

function Summary() {
  const q = useQuery({ queryKey: ['inventory', 'summary'], queryFn: loadInventorySummary })
  if (q.isPending) return <Loading label="Loading stock summary…" />
  if (q.isError) return <ErrorBox error={q.error} retry={() => void q.refetch()} />
  const s = q.data
  const cards: Array<[string, number | string]> = [
    ['Phones in stock', s.inStock],
    ['Damaged', s.damaged],
    ['Lost', s.lost],
    ['Returned to supplier', s.returnedToSupplier],
    ['Sold', s.sold],
    ['Accessory SKUs in stock', s.accessorySkusInStock],
    ['Accessory units', s.accessoryUnitsTruncated ? `${s.accessoryUnits}+` : s.accessoryUnits],
  ]
  return (
    <div className="cards" aria-label="Stock summary">
      {cards.map(([label, value]) => (
        <div className="card" key={label}>
          <div className="card-num">{value}</div>
          <div>{label}</div>
        </div>
      ))}
    </div>
  )
}

function DevicesTab() {
  const [params, setParams] = useSearchParams()
  const term = sanitizeSearch(params.get('q') ?? '')
  const status = (STATUSES.includes(params.get('status') as InventoryStatus) ? params.get('status') : '') as InventoryStatus | ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState(params.get('q') ?? '')

  const index = useQuery({ queryKey: ['variant-index'], queryFn: listVariantIndex, staleTime: 60_000 })
  const variantIds = useMemo(() => (term && index.data ? matchVariantIds(index.data, term) : []), [index.data, term])
  // wait for the variant index before searching, otherwise a product-name search would briefly show no results
  const ready = !term || index.isSuccess || index.isError

  const list = useQuery({
    queryKey: ['inventory', 'devices', { page, status, term, variantIds }],
    queryFn: () => listDevices({ page, status, variantIds, identifierTerm: term }),
    enabled: ready,
    placeholderData: (prev) => prev,
  })

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    update({ q: sanitizeSearch(draft), page: '' })
  }

  return (
    <div>
      <form className="filters" onSubmit={submit} role="search">
        <input
          className="search"
          type="search"
          aria-label="Search devices"
          placeholder="Search product, brand, SKU, IMEI or serial"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit">Search</Button>
        <label>
          <span className="sr-only">Status</span>
          <select aria-label="Filter by status" value={status} onChange={(e) => update({ status: e.target.value, page: '' })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {(term || status) && (
          <Button type="button" onClick={() => { setDraft(''); setParams({}, { replace: true }) }}>
            Clear
          </Button>
        )}
      </form>

      {(list.isPending || !ready) && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <>
          <p className="muted" aria-live="polite">
            {list.data.total} {list.data.total === 1 ? 'device' : 'devices'}
          </p>
          <table className="table" aria-label="Devices">
            <thead>
              <tr>
                <th>Product</th>
                <th>IMEI 1</th>
                <th>IMEI 2 / Serial</th>
                <th>Condition</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {term || status ? 'No device matches your search.' : 'No devices yet. Receive a purchase to add phones to stock.'}
                  </td>
                </tr>
              )}
              {list.data.rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/inventory/devices/${d.id}`}>{variantTitle(d.variant)}</Link>
                    <div className="muted">{d.variant?.sku}</div>
                  </td>
                  <td className="mono">{d.imei1 ?? '—'}</td>
                  <td className="mono">{d.imei2 ?? d.serial_number ?? '—'}</td>
                  <td>{CONDITION_LABEL[d.condition]}</td>
                  <td>{d.shelf_location ?? '—'}</td>
                  <td>
                    <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={pageCount(list.data.total)} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </div>
  )
}

function AccessoriesTab() {
  const [params, setParams] = useSearchParams()
  const term = sanitizeSearch(params.get('q') ?? '')
  const stock = params.get('stock') === 'in' || params.get('stock') === 'out' ? params.get('stock') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState(params.get('q') ?? '')
  const list = useQuery({ queryKey: ['inventory', 'accessories'], queryFn: listAccessories })

  // All quantity SKUs are loaded once (a shop has hundreds, not thousands) and filtered here.
  const filtered = useMemo(() => {
    const words = term.toLowerCase().split(' ').filter(Boolean)
    return (list.data ?? []).filter((a) => {
      const hay = `${a.product?.brand?.name ?? ''} ${a.product?.name ?? ''} ${a.color ?? ''} ${a.sku}`.toLowerCase()
      return words.every((w) => hay.includes(w)) && (stock === '' || (stock === 'in' ? a.on_hand > 0 : a.on_hand === 0))
    })
  }, [list.data, term, stock])
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }

  return (
    <div>
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: sanitizeSearch(draft), page: '' }) }}>
        <input className="search" type="search" aria-label="Search accessories" placeholder="Search product, brand or SKU" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit">Search</Button>
        <select aria-label="Filter by stock" value={stock ?? ''} onChange={(e) => update({ stock: e.target.value, page: '' })}>
          <option value="">All stock levels</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock</option>
        </select>
      </form>
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <>
          <p className="muted" aria-live="polite">
            {filtered.length} accessory {filtered.length === 1 ? 'SKU' : 'SKUs'}
          </p>
          <table className="table" aria-label="Accessories">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="right">On hand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {list.data.length === 0 ? 'No accessory SKUs yet. Add a variant with stock type "Accessory (quantity)".' : 'No accessory matches your search.'}
                  </td>
                </tr>
              )}
              {slice.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/inventory/accessories/${a.id}`}>{variantTitle(a)}</Link>
                  </td>
                  <td>{a.sku}</td>
                  <td className="right">{a.on_hand}</td>
                  <td>
                    {a.on_hand > 0 ? <Badge tone="good">In stock</Badge> : <Badge tone="warn">Out of stock</Badge>} {!a.is_active && <Badge>Inactive</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={pageCount(filtered.length)} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </div>
  )
}

export function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'accessories' ? 'accessories' : 'devices'
  return (
    <div>
      <div className="page-head">
        <h1>Inventory</h1>
      </div>
      <Summary />
      <div className="tabs" role="tablist" aria-label="Inventory type">
        <button role="tab" aria-selected={tab === 'devices'} onClick={() => setParams({}, { replace: true })}>
          Phones (by IMEI)
        </button>
        <button role="tab" aria-selected={tab === 'accessories'} onClick={() => setParams({ tab: 'accessories' }, { replace: true })}>
          Accessories (by quantity)
        </button>
      </div>
      {tab === 'devices' ? <DevicesTab /> : <AccessoriesTab />}
    </div>
  )
}
