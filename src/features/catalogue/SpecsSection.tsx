import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addSpec, deleteSpec, listSpecs, updateSpec } from '../../api/productMedia'
import { toAppError } from '../../lib/errors'
import type { ProductSpec } from '../../lib/types'
import { Button, Dialog, ErrorBox, Field, Loading, useConfirm, useToast } from '../../components/ui'
import { groupSpecs, validateSpec, type SpecForm } from './media'

function SpecDialog({ productId, spec, onClose }: { productId: string; spec: ProductSpec | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<SpecForm>(spec ? { group: spec.group_name, key: spec.spec_key, value: spec.spec_value, order: String(spec.sort_order) } : { group: 'General', key: '', value: '', order: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validateSpec>['errors']>({})
  const set = (k: keyof SpecForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const save = useMutation({
    mutationFn: async (v: NonNullable<ReturnType<typeof validateSpec>['value']>) => {
      if (spec) await updateSpec(spec.id, v)
      else await addSpec(productId, v)
    },
    onSuccess: () => {
      notify(spec ? 'Specification saved' : 'Specification added')
      void qc.invalidateQueries({ queryKey: ['product-specs', productId] })
      onClose()
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    const { errors: found, value } = validateSpec(form)
    setErrors(found)
    if (value && !save.isPending) save.mutate(value)
  }
  return (
    <Dialog title={spec ? 'Edit specification' : 'New specification'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Group" error={errors.group} hint="Specifications are grouped on the website, e.g. Display, Camera, Battery.">
          {(p) => <input {...p} value={form.group} maxLength={60} onChange={(e) => set('group', e.target.value)} />}
        </Field>
        <Field label="Name" error={errors.key}>
          {(p) => <input {...p} value={form.key} maxLength={60} placeholder="e.g. Screen size" onChange={(e) => set('key', e.target.value)} />}
        </Field>
        <Field label="Value" error={errors.value}>
          {(p) => <input {...p} value={form.value} maxLength={300} placeholder="e.g. 6.5 inch AMOLED" onChange={(e) => set('value', e.target.value)} />}
        </Field>
        <Field label="Order (optional)" error={errors.order} hint="Smaller numbers come first.">
          {(p) => <input {...p} inputMode="numeric" value={form.order} onChange={(e) => set('order', e.target.value)} />}
        </Field>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
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

export function SpecsSection({ productId }: { productId: string }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<ProductSpec | 'new' | null>(null)
  const specs = useQuery({ queryKey: ['product-specs', productId], queryFn: () => listSpecs(productId) })
  const remove = useMutation({
    mutationFn: (id: string) => deleteSpec(id),
    onSuccess: () => {
      notify('Specification deleted')
      void qc.invalidateQueries({ queryKey: ['product-specs', productId] })
    },
    onError: (e) => {
      notify(toAppError(e).message, 'bad')
      void qc.invalidateQueries({ queryKey: ['product-specs', productId] })
    },
  })
  const groups = groupSpecs(specs.data ?? [])

  return (
    <section className="panel" aria-label="Specifications">
      <div className="page-head">
        <h2>Specifications</h2>
        <Button variant="primary" onClick={() => setEditing('new')}>
          Add specification
        </Button>
      </div>
      <p className="muted">Shown on the website product page, grouped as below.</p>
      {specs.isPending && <Loading />}
      {specs.isError && <ErrorBox error={specs.error} retry={() => void specs.refetch()} />}
      {specs.data && groups.length === 0 && <p className="muted">No specifications yet.</p>}
      {groups.map((g) => (
        <div key={g.group}>
          <h3>{g.group}</h3>
          <table className="table" aria-label={`${g.group} specifications`}>
            <tbody>
              {g.rows.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.spec_key}</th>
                  <td>{s.spec_value}</td>
                  <td className="right">
                    <Button small onClick={() => setEditing(s)} aria-label={`Edit ${s.spec_key}`}>
                      Edit
                    </Button>{' '}
                    <Button small variant="danger" disabled={remove.isPending} aria-label={`Delete ${s.spec_key}`} onClick={() => void confirm({ title: 'Delete specification', message: `Delete “${s.spec_key}”?`, confirmLabel: 'Delete', danger: true }).then((ok) => ok && remove.mutate(s.id))}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {editing && <SpecDialog productId={productId} spec={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}
