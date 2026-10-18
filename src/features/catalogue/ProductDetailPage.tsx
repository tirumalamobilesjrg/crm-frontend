import { useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createVariant, getProduct, listVariants, updateVariant } from '../../api/catalogue'
import { toAppError } from '../../lib/errors'
import { formatINR } from '../../lib/money'
import type { Variant } from '../../lib/types'
import { Badge, Button, Dialog, ErrorBox, Field, Loading, useToast } from '../../components/ui'
import { validateVariant, type VariantForm } from './validation'

const EMPTY: VariantForm = { sku: '', color: '', ram: '', storage: '', mrp: '', selling: '', publicPrice: '', trackingMode: 'serialized' }

const toForm = (v: Variant): VariantForm => ({
  sku: v.sku,
  color: v.color ?? '',
  ram: v.ram_gb?.toString() ?? '',
  storage: v.storage_gb?.toString() ?? '',
  mrp: v.mrp.toString(),
  selling: v.selling_price.toString(),
  publicPrice: v.public_price?.toString() ?? '',
  trackingMode: v.tracking_mode,
})

function VariantDialog(props: { productId: string; variant: Variant | null; onClose: () => void }) {
  const { variant } = props
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<VariantForm>(variant ? toForm(variant) : EMPTY)
  const [active, setActive] = useState(variant?.is_active ?? true)
  const [errors, setErrors] = useState<ReturnType<typeof validateVariant>['errors']>({})
  const set = <K extends keyof VariantForm>(k: K, v: VariantForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async (v: NonNullable<ReturnType<typeof validateVariant>['value']>) => {
      if (variant) {
        await updateVariant(variant.id, {
          color: v.color,
          ram_gb: v.ram_gb,
          storage_gb: v.storage_gb,
          mrp: v.mrp,
          selling_price: v.selling_price,
          public_price: v.public_price,
          is_active: active,
        })
      } else {
        await createVariant({
          product_id: props.productId,
          sku: v.sku,
          color: v.color,
          ram_gb: v.ram_gb,
          storage_gb: v.storage_gb,
          mrp: v.mrp,
          selling_price: v.selling_price,
          public_price: v.public_price,
          tracking_mode: v.tracking_mode,
        })
      }
    },
    onSuccess: () => {
      notify(variant ? 'Variant saved' : 'Variant added')
      void qc.invalidateQueries({ queryKey: ['variants', props.productId] })
      props.onClose()
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateVariant(form)
    setErrors(found)
    if (value) save.mutate(value)
  }

  return (
    <Dialog title={variant ? `Edit ${variant.sku}` : 'New variant'} onClose={props.onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="SKU" error={errors.sku} hint="Unique stock code, e.g. NOVA-X1-8-128-BLK">
          {(p) => <input {...p} value={form.sku} disabled={Boolean(variant)} onChange={(e) => set('sku', e.target.value.toUpperCase())} />}
        </Field>
        <Field label="Stock type" hint={variant ? 'Cannot change once the variant exists.' : 'Phones are tracked by IMEI/serial; accessories by quantity.'}>
          {(p) => (
            <select {...p} value={form.trackingMode} disabled={Boolean(variant)} onChange={(e) => set('trackingMode', e.target.value as VariantForm['trackingMode'])}>
              <option value="serialized">Phone / device (IMEI or serial)</option>
              <option value="quantity">Accessory (quantity)</option>
            </select>
          )}
        </Field>
        <div className="grid-3">
          <Field label="Colour">{(p) => <input {...p} value={form.color} onChange={(e) => set('color', e.target.value)} />}</Field>
          <Field label="RAM (GB)" error={errors.ram}>
            {(p) => <input {...p} inputMode="numeric" value={form.ram} onChange={(e) => set('ram', e.target.value)} />}
          </Field>
          <Field label="Storage (GB)" error={errors.storage}>
            {(p) => <input {...p} inputMode="numeric" value={form.storage} onChange={(e) => set('storage', e.target.value)} />}
          </Field>
        </div>
        <div className="grid-3">
          <Field label="MRP (₹)" error={errors.mrp}>
            {(p) => <input {...p} inputMode="decimal" value={form.mrp} onChange={(e) => set('mrp', e.target.value)} />}
          </Field>
          <Field label="Selling price (₹)" error={errors.selling} hint="Internal. Never shown on the website.">
            {(p) => <input {...p} inputMode="decimal" value={form.selling} onChange={(e) => set('selling', e.target.value)} />}
          </Field>
          <Field label="Website price (₹)" error={errors.publicPrice} hint="Optional. Shown publicly; empty = “contact the shop”.">
            {(p) => <input {...p} inputMode="decimal" value={form.publicPrice} onChange={(e) => set('publicPrice', e.target.value)} />}
          </Field>
        </div>
        {variant && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (inactive variants cannot be sold or shown)
          </label>
        )}
        <div className="dialog-actions">
          <Button type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ProductDetailPage() {
  const { id = '' } = useParams()
  // Arriving straight from "Create product" opens the Add variant dialog so the product is never left without one.
  const location = useLocation()
  const [editing, setEditing] = useState<Variant | 'new' | null>(() =>
    (location.state as { addVariant?: boolean } | null)?.addVariant ? 'new' : null,
  )
  const product = useQuery({ queryKey: ['product', id], queryFn: () => getProduct(id) })
  const variants = useQuery({ queryKey: ['variants', id], queryFn: () => listVariants(id) })

  if (product.isPending) return <Loading />
  if (product.isError) return <ErrorBox error={product.error} retry={() => void product.refetch()} />
  const p = product.data

  return (
    <div>
      <p>
        <Link to="/catalogue/products">← Products</Link>
      </p>
      <div className="page-head">
        <h1>{p.name}</h1>
        {p.is_published ? <Badge tone="good">Published</Badge> : <Badge>Draft</Badge>}
      </div>
      <p className="muted">
        {p.brand?.name} · {p.category?.name}
      </p>
      {p.description && <p>{p.description}</p>}

      <section className="panel">
        <div className="page-head">
          <h2>Variants</h2>
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add variant
          </Button>
        </div>
        {variants.isPending && <Loading />}
        {variants.isError && <ErrorBox error={variants.error} retry={() => void variants.refetch()} />}
        {variants.data && (
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Details</th>
                <th>Stock type</th>
                <th className="right">MRP</th>
                <th className="right">Selling</th>
                <th className="right">Website price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {variants.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No variants yet. A product needs at least one variant before it can be bought or sold.
                  </td>
                </tr>
              )}
              {variants.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.sku}</td>
                  <td>{[v.color, v.ram_gb ? `${v.ram_gb} GB RAM` : null, v.storage_gb ? `${v.storage_gb} GB` : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{v.tracking_mode === 'serialized' ? 'Phone (IMEI)' : 'Accessory'}</td>
                  <td className="right">{formatINR(v.mrp)}</td>
                  <td className="right">{formatINR(v.selling_price)}</td>
                  <td className="right">{v.public_price === null ? <span className="muted">contact shop</span> : formatINR(v.public_price)}</td>
                  <td>{v.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Inactive</Badge>}</td>
                  <td className="right">
                    <Button small onClick={() => setEditing(v)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {editing && <VariantDialog productId={id} variant={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
