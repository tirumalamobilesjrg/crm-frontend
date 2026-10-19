import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deletePhoto, listImages, photoUrl, setPrimaryPhoto, swapPhotoOrder, updateImageAlt, uploadPhoto } from '../../api/productMedia'
import { toAppError } from '../../lib/errors'
import type { ProductImage } from '../../lib/types'
import { Badge, Button, ErrorBox, Loading, useConfirm, useToast } from '../../components/ui'
import { MAX_BATCH, MAX_INPUT_BYTES, PHOTO_TYPES, sortImages, validateAlt, validateChosen } from './media'

function PhotoCard({ image, index, total, all, productId }: { image: ProductImage; index: number; total: number; all: ProductImage[]; productId: string }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const confirm = useConfirm()
  const [alt, setAlt] = useState(image.alt_text)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['product-images', productId] })
  const onError = (e: unknown) => notify(toAppError(e).message, 'bad')

  const primary = useMutation({ mutationFn: () => setPrimaryPhoto(productId, image.id), onSuccess: () => { notify('Main photo changed'); refresh() }, onError: (e) => { onError(e); refresh() } })
  const move = useMutation({
    mutationFn: (dir: -1 | 1) => swapPhotoOrder(image, all[index + dir]!),
    onSuccess: refresh,
    onError: (e) => { onError(e); refresh() },
  })
  const saveAlt = useMutation({ mutationFn: () => updateImageAlt(image.id, alt), onSuccess: () => { notify('Description saved'); refresh() }, onError })
  const remove = useMutation({ mutationFn: () => deletePhoto(image), onSuccess: () => { notify('Photo deleted'); refresh() }, onError: (e) => { onError(e); refresh() } })
  const altProblem = validateAlt(alt)
  const busy = primary.isPending || move.isPending || saveAlt.isPending || remove.isPending

  return (
    <li className="photo-card">
      <img src={photoUrl(image.storage_path)} alt={image.alt_text || 'Product photo'} loading="lazy" />
      <div className="photo-meta">
        {image.is_primary && <Badge tone="good">Main photo</Badge>}
        <label className="field">
          <span className="sr-only">Description of photo {index + 1}</span>
          <input aria-label={`Description of photo ${index + 1}`} value={alt} maxLength={200} placeholder="Describe the photo for people who cannot see it" onChange={(e) => setAlt(e.target.value)} aria-invalid={Boolean(altProblem)} />
        </label>
        {altProblem && <small className="field-error" role="alert">{altProblem}</small>}
        <div className="photo-actions">
          <Button small disabled={busy || alt.trim() === image.alt_text || Boolean(altProblem)} onClick={() => saveAlt.mutate()} aria-label={`Save description of photo ${index + 1}`}>Save</Button>
          {!image.is_primary && (
            <Button small disabled={busy} onClick={() => primary.mutate()} aria-label={`Make photo ${index + 1} the main photo`}>
              Make main
            </Button>
          )}
          <Button small disabled={busy || index === 0} onClick={() => move.mutate(-1)} aria-label={`Move photo ${index + 1} earlier`}>←</Button>
          <Button small disabled={busy || index === total - 1} onClick={() => move.mutate(1)} aria-label={`Move photo ${index + 1} later`}>→</Button>
          <Button
            small
            variant="danger"
            disabled={busy}
            aria-label={`Delete photo ${index + 1}`}
            onClick={() => void confirm({ title: 'Delete photo', message: 'Delete this photo? It disappears from the website straight away.', confirmLabel: 'Delete', danger: true }).then((ok) => ok && remove.mutate())}
          >
            Delete
          </Button>
        </div>
      </div>
    </li>
  )
}

type Item = { id: number; file: File; problem: string | null; status: 'ready' | 'uploading' | 'failed'; error?: string }

export function PhotosSection({ productId }: { productId: string }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const images = useQuery({ queryKey: ['product-images', productId], queryFn: () => listImages(productId) })
  const [items, setItems] = useState<Item[]>([])
  const [alt, setAlt] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const sorted = sortImages(images.data ?? [])
  const single = items.length === 1 ? items[0]! : null
  const preview = useMemo(() => (single && !single.problem ? URL.createObjectURL(single.file) : null), [single])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? [])
    const picked = all.slice(0, MAX_BATCH)
    setItems(picked.map((file) => ({ id: nextId.current++, file, problem: validateChosen(file), status: 'ready' as const })))
    setProblem(all.length > MAX_BATCH ? `Only the first ${MAX_BATCH} photos were kept. Upload them, then add the rest.` : picked.length === 1 ? validateChosen(picked[0]!) : null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (running.current) return
    const queue = items.filter((i) => !i.problem)
    const p = queue.length === 0 ? (items.length === 0 ? 'Choose a photo first.' : 'None of the chosen files can be uploaded. Fix the problems shown.') : single ? validateAlt(alt) : null
    setProblem(p)
    if (p) return
    running.current = true
    setBusy(true)
    let hasPhotos = sorted.length > 0
    let done = 0
    for (const item of queue) {
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)))
      try {
        await uploadPhoto(productId, item.file, single ? alt : '', !hasPhotos, crypto.randomUUID())
        hasPhotos = true
        done += 1
        setItems((cur) => cur.filter((i) => i.id !== item.id))
      } catch (err) {
        setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, status: 'failed', error: toAppError(err).message } : i)))
      }
    }
    running.current = false
    setBusy(false)
    if (done > 0) void qc.invalidateQueries({ queryKey: ['product-images', productId] })
    if (done === queue.length) {
      notify(done === 1 ? 'Photo uploaded' : `${done} photos uploaded`)
      setAlt('')
      if (input.current) input.current.value = ''
    } else {
      notify(done === 0 ? 'No photos were uploaded. See the reasons below.' : `${done} of ${queue.length} photos uploaded. See the ones that failed below.`, 'bad')
    }
  }

  const readyCount = items.filter((i) => !i.problem).length
  return (
    <section className="panel" aria-label="Photos">
      <h2>Photos</h2>
      <p className="muted">
        Photos are public: they appear on the website once the product is published. JPEG, PNG or WebP, up to {MAX_INPUT_BYTES / 1024 / 1024} MB each; big camera photos are shrunk automatically. You can choose up to {MAX_BATCH} photos at once. The main photo is shown first.
      </p>
      <form onSubmit={(e) => void submit(e)} className="photo-upload" noValidate>
        <label className="field">
          <span>Photo</span>
          <input ref={input} type="file" multiple accept={PHOTO_TYPES.join(',')} onChange={choose} aria-invalid={Boolean(problem)} disabled={busy} />
        </label>
        {items.length <= 1 ? (
          <label className="field">
            <span>Description (optional)</span>
            <input value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. Nova X1 in black, front view" />
          </label>
        ) : (
          <p className="muted small">Add descriptions after uploading, one photo at a time.</p>
        )}
        {preview && <img className="photo-preview" src={preview} alt="Preview of the chosen photo" />}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Uploading…' : readyCount > 1 ? `Upload ${readyCount} photos` : 'Upload photo'}
        </Button>
        {problem && <p role="alert" className="field-error">{problem}</p>}
      </form>
      {(items.length > 1 || items.some((i) => i.status === 'failed')) && (
        <ul className="muted" aria-label="Chosen photos">
          {items.map((i) => (
            <li key={i.id}>
              {i.file.name}: {i.problem ?? (i.status === 'uploading' ? 'uploading…' : i.status === 'failed' ? `failed. ${i.error}` : 'ready')}
            </li>
          ))}
        </ul>
      )}

      {images.isPending && <Loading />}
      {images.isError && <ErrorBox error={images.error} retry={() => void images.refetch()} />}
      {images.data && sorted.length === 0 && <p className="muted">No photos yet. The website shows a placeholder until you add one.</p>}
      {sorted.length > 0 && (
        <ul className="photo-grid" aria-label="Product photos">
          {sorted.map((img, i) => (
            <PhotoCard key={img.id} image={img} index={i} total={sorted.length} all={sorted} productId={productId} />
          ))}
        </ul>
      )}
    </section>
  )
}
