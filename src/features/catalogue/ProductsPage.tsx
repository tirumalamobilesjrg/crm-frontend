import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProduct, listBrands, listCategories, listProducts, setPublished } from '../../api/catalogue'
import { productSlug } from '../../lib/slug'
import { toAppError } from '../../lib/errors'
import { Badge, Button, Dialog, ErrorBox, Field, Loading, useConfirm, useToast } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { validateProduct, type ProductForm } from './validation'

function NewProductDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()
  const { state: auth } = useAuth()
  const role = auth.status === 'ready' ? auth.profile.role : null
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands })
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const [form, setForm] = useState<ProductForm>({ name: '', brand_id: '', category_id: '', description: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateProduct>>({})

  const create = useMutation({
    mutationFn: () =>
      createProduct({
        brand_id: form.brand_id,
        category_id: form.category_id,
        name: form.name.trim(),
        slug: productSlug(brands.data?.find((b) => b.id === form.brand_id)?.name ?? '', form.name),
        description: form.description.trim() === '' ? null : form.description.trim(),
      }),
    onSuccess: (p) => {
      notify(role === 'admin' ? 'Product created. Add its variants next.' : 'Product created. An Admin must add its variants and prices.')
      void qc.invalidateQueries({ queryKey: ['products'] })
      navigate(`/catalogue/products/${p.id}`, { state: { addVariant: true } })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const found = validateProduct(form)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate()
  }

  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <Dialog title="New product" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Product name (model)" error={errors.name} hint="e.g. Galaxy S24. Colour, RAM and storage are added as variants.">
          {(p) => <input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={160} />}
        </Field>
        <Field label="Brand" error={errors.brand_id}>
          {(p) => (
            <select {...p} value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              <option value="">Choose…</option>
              {brands.data?.filter((b) => b.is_active).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Category" error={errors.category_id}>
          {(p) => (
            <select {...p} value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">Choose…</option>
              {categories.data?.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Description (shown on the website once published)">
          {(p) => <textarea {...p} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create product'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ProductsPage() {
  const qc = useQueryClient()
  const { notify } = useToast()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const list = useQuery({ queryKey: ['products'], queryFn: listProducts })

  const publish = useMutation({
    mutationFn: (v: { id: string; value: boolean }) => setPublished(v.id, v.value),
    onSuccess: (_d, v) => {
      notify(v.value ? 'Published on the website' : 'Removed from the website')
      void qc.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (list.data ?? []).filter((p) => term === '' || `${p.name} ${p.brand?.name ?? ''} ${p.category?.name ?? ''}`.toLowerCase().includes(term))
  }, [list.data, search])

  return (
    <div>
      <div className="page-head">
        <h1>Products</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New product
        </Button>
      </div>
      <input className="search" type="search" placeholder="Search by name, brand or category" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Website</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {list.data.length === 0 ? 'No products yet. Add brands and categories first, then create a product.' : 'No product matches your search.'}
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/catalogue/products/${p.id}`}>{p.name}</Link>
                </td>
                <td>{p.brand?.name}</td>
                <td>{p.category?.name}</td>
                <td>{p.is_published ? <Badge tone="good">Published</Badge> : <Badge>Draft</Badge>}</td>
                <td className="right">
                  <Button
                    small
                    disabled={publish.isPending}
                    onClick={() => {
                      const next = !p.is_published
                      void confirm({
                        title: next ? 'Publish product' : 'Unpublish product',
                        message: next ? `Publish "${p.name}" on the public website?` : `Remove "${p.name}" from the public website?`,
                        confirmLabel: next ? 'Publish' : 'Unpublish',
                      }).then((ok) => ok && publish.mutate({ id: p.id, value: next }))
                    }}
                  >
                    {p.is_published ? 'Unpublish' : 'Publish'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <NewProductDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
