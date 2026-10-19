import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBrand, createCategory, listBrands, listCategories, setBrandActive, setCategoryActive } from '../../api/catalogue'
import { removeBrandLogo, saveBrandLogo } from '../../api/brandLogos'
import { removeCategoryImage, saveCategoryImage } from '../../api/categoryImages'
import { slugify } from '../../lib/slug'
import { toAppError } from '../../lib/errors'
import { Badge, Button, ErrorBox, Field, Loading, useToast } from '../../components/ui'
import { choiceToFile, suggestLogo, type LogoChoice } from './logoGallery'
import { ChoiceMark, LogoPickerDialog, SavedBrandMark } from './BrandLogos'
import { CategoryPictureDialog, CategoryThumb } from './CategoryPicture'

interface Named {
  id: string
  name: string
  slug: string
  is_active: boolean
  logo_path?: string | null
  image_path?: string | null
}

/** Which logo dialog is open: the one in the "new brand" form, or the one for a saved brand. */
type Picking = 'new' | Named | null

function Section(props: {
  title: string
  queryKey: string
  load: () => Promise<Named[]>
  create: (i: { name: string; slug: string }) => Promise<unknown>
  toggle: (id: string, active: boolean) => Promise<unknown>
  /** Brands only: show logos and let staff choose them. */
  logos?: boolean
  /** Categories only: show pictures and let staff choose them. */
  pictures?: boolean
}) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [name, setName] = useState('')
  const [choice, setChoice] = useState<LogoChoice | 'none' | null>(null) // null = follow the suggestion for the typed name
  const [picking, setPicking] = useState<Picking>(null)
  const [picturing, setPicturing] = useState<Named | null>(null)
  const suggestion = props.logos ? suggestLogo(name) : undefined
  const logoForNew: LogoChoice | null = choice === 'none' ? null : choice ?? (suggestion ? { kind: 'curated', logo: suggestion } : null)
  const list = useQuery({ queryKey: [props.queryKey], queryFn: props.load })
  const add = useMutation({
    mutationFn: async (v: { name: string; logo: LogoChoice | null }) => {
      const created = (await props.create({ name: v.name, slug: slugify(v.name) })) as Named | undefined
      if (!v.logo || !created) return { logoError: null }
      try {
        await saveBrandLogo({ id: created.id, slug: created.slug, logo_path: null }, await choiceToFile(v.logo), crypto.randomUUID())
        return { logoError: null }
      } catch (e) {
        return { logoError: toAppError(e).message } // the brand exists; only its logo failed
      }
    },
    onSuccess: ({ logoError }, v) => {
      // Staff may already be typing the next name while the logo uploads: only clear what was just submitted.
      if (name.trim() === v.name) {
        setName('')
        setChoice(null)
      }
      if (logoError) notify(`Brand added, but its logo could not be saved: ${logoError} Add it from the Logo button.`, 'bad')
      else notify(`${props.title.slice(0, -1)} added`)
      void qc.invalidateQueries({ queryKey: [props.queryKey] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })
  const flip = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => props.toggle(v.id, v.active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [props.queryKey] }),
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  const setLogo = useMutation({
    mutationFn: async (v: { brand: Named; choice: LogoChoice | null }) => {
      if (v.choice) await saveBrandLogo({ id: v.brand.id, slug: v.brand.slug, logo_path: v.brand.logo_path ?? null }, await choiceToFile(v.choice), crypto.randomUUID())
      else await removeBrandLogo({ id: v.brand.id, logo_path: v.brand.logo_path ?? null })
    },
    onSuccess: (_d, v) => {
      setPicking(null)
      notify(v.choice ? 'Logo saved' : 'Logo removed')
      void qc.invalidateQueries({ queryKey: [props.queryKey] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  const setPicture = useMutation({
    mutationFn: async (v: { category: Named; file: File | null }) => {
      const c = { id: v.category.id, slug: v.category.slug, image_path: v.category.image_path ?? null }
      if (v.file) await saveCategoryImage(c, v.file, crypto.randomUUID())
      else await removeCategoryImage(c)
    },
    onSuccess: (_d, v) => {
      setPicturing(null)
      notify(v.file ? 'Picture saved' : 'Picture removed')
      void qc.invalidateQueries({ queryKey: [props.queryKey] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (slugify(name) === '') return notify('Enter a name using letters or digits.', 'bad')
    add.mutate({ name: name.trim(), logo: logoForNew })
  }

  return (
    <section className="panel">
      <h2>{props.title}</h2>
      <form className="inline-form" onSubmit={submit}>
        <Field label={`New ${props.title === 'Categories' ? 'category' : props.title.slice(0, -1).toLowerCase()} name`}>
          {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        {props.logos && (
          <div className="field">
            <span className="label-like">Logo</span>
            <button type="button" className="btn btn-secondary logo-trigger" onClick={() => setPicking('new')}>
              <ChoiceMark choice={logoForNew} name={name} size={28} />
              {logoForNew ? 'Change' : 'Choose logo'}
            </button>
          </div>
        )}
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
              <th><span className="sr-only">Actions</span></th>
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
                <td>
                  {props.logos ? (
                    <span className="name-with-mark">
                      <SavedBrandMark path={r.logo_path ?? null} name={r.name} />
                      {r.name}
                    </span>
                  ) : props.pictures ? (
                    <span className="name-with-mark">
                      <CategoryThumb path={r.image_path ?? null} name={r.name} />
                      {r.name}
                    </span>
                  ) : (
                    r.name
                  )}
                </td>
                <td>{r.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Hidden</Badge>}</td>
                <td className="right">
                  {props.pictures && (
                    <>
                      <Button small aria-label={`Picture for ${r.name}`} onClick={() => setPicturing(r)}>
                        Picture
                      </Button>{' '}
                    </>
                  )}
                  {props.logos && (
                    <>
                      <Button small aria-label={`Logo for ${r.name}`} onClick={() => setPicking(r)}>
                        Logo
                      </Button>{' '}
                    </>
                  )}
                  <Button small onClick={() => flip.mutate({ id: r.id, active: !r.is_active })}>
                    {r.is_active ? 'Hide' : 'Show'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {picking === 'new' && (
        <LogoPickerDialog
          brandName={name.trim()}
          hasLogo={logoForNew !== null}
          onChoose={(c) => {
            setChoice(c)
            setPicking(null)
          }}
          onRemove={() => {
            setChoice('none')
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {picturing && (
        <CategoryPictureDialog
          name={picturing.name}
          path={picturing.image_path ?? null}
          busy={setPicture.isPending}
          onChoose={(file) => setPicture.mutate({ category: picturing, file })}
          onRemove={() => setPicture.mutate({ category: picturing, file: null })}
          onClose={() => setPicturing(null)}
        />
      )}
      {picking && picking !== 'new' && (
        <LogoPickerDialog
          brandName={picking.name}
          hasLogo={Boolean(picking.logo_path)}
          onChoose={(c) => setLogo.mutate({ brand: picking, choice: c })}
          onRemove={() => setLogo.mutate({ brand: picking, choice: null })}
          onClose={() => setPicking(null)}
        />
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
        <Section title="Brands" queryKey="brands" load={listBrands} create={createBrand} toggle={setBrandActive} logos />
        <Section title="Categories" queryKey="categories" load={listCategories} create={createCategory} toggle={setCategoryActive} pictures />
      </div>
    </div>
  )
}
