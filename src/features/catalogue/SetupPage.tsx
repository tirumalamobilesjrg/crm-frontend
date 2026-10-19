import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBrand, createCategory, listBrands, listCategories, setBrandActive, setCategoryActive } from '../../api/catalogue'
import { slugify } from '../../lib/slug'
import { toAppError } from '../../lib/errors'
import { Badge, Button, ErrorBox, Field, Loading, useToast } from '../../components/ui'

interface Named {
  id: string
  name: string
  slug: string
  is_active: boolean
}

function Section(props: {
  title: string
  queryKey: string
  load: () => Promise<Named[]>
  create: (i: { name: string; slug: string }) => Promise<unknown>
  toggle: (id: string, active: boolean) => Promise<unknown>
}) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [name, setName] = useState('')
  const list = useQuery({ queryKey: [props.queryKey], queryFn: props.load })
  const add = useMutation({
    mutationFn: () => props.create({ name: name.trim(), slug: slugify(name) }),
    onSuccess: () => {
      setName('')
      notify(`${props.title.slice(0, -1)} added`)
      void qc.invalidateQueries({ queryKey: [props.queryKey] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })
  const flip = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => props.toggle(v.id, v.active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [props.queryKey] }),
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (slugify(name) === '') return notify('Enter a name using letters or digits.', 'bad')
    add.mutate()
  }

  return (
    <section className="panel">
      <h2>{props.title}</h2>
      <form className="inline-form" onSubmit={submit}>
        <Field label={`New ${props.title === 'Categories' ? 'category' : props.title.slice(0, -1).toLowerCase()} name`}>
          {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        <Button type="submit" variant="primary" disabled={add.isPending || name.trim() === ''}>
          Add
        </Button>
      </form>
      {list.isPending && <Loading />}
      {list.isError && <ErrorBox error={list.error} retry={() => void list.refetch()} />}
      {list.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Nothing yet.
                </td>
              </tr>
            )}
            {list.data.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Hidden</Badge>}</td>
                <td className="right">
                  <Button small onClick={() => flip.mutate({ id: r.id, active: !r.is_active })}>
                    {r.is_active ? 'Hide' : 'Show'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function SetupPage() {
  return (
    <div>
      <h1>Brands &amp; categories</h1>
      <p className="muted">Hiding a brand or category also hides its products from the public website.</p>
      <div className="two-col">
        <Section title="Brands" queryKey="brands" load={listBrands} create={createBrand} toggle={setBrandActive} />
        <Section title="Categories" queryKey="categories" load={listCategories} create={createCategory} toggle={setCategoryActive} />
      </div>
    </div>
  )
}
