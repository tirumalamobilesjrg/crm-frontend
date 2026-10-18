import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deletePhoto, listImages, photoUrl, setPrimaryPhoto, swapPhotoOrder, updateImageAlt, uploadPhoto } from '../../api/productMedia'
import { toAppError } from '../../lib/errors'
import type { ProductImage } from '../../lib/types'
import { Badge, Button, ErrorBox, Loading, useToast } from '../../components/ui'
import { MAX_PHOTO_BYTES, PHOTO_TYPES, sortImages, validateAlt, validatePhoto } from './media'

function PhotoCard({ image, index, total, all, productId }: { image: ProductImage; index: number; total: number; all: ProductImage[]; productId: string }) {
  const qc = useQueryClient()
  const { notify } = useToast()
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
          <input aria-label={`Description of photo ${index + 1}`} value={alt} maxLength={200} placeholder="Describe the photo (helps search engines)" onChange={(e) => setAlt(e.target.value)} aria-invalid={Boolean(altProblem)} />
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
            onClick={() => window.confirm('Delete this photo? It disappears from the website straight away.') && remove.mutate()}
          >
            Delete
          </Button>
        </div>
      </div>
    </li>
  )
}

export function PhotosSection({ productId }: { productId: string }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const images = useQuery({ queryKey: ['product-images', productId], queryFn: () => listImages(productId) })
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const preview = useMemo(() => (file && !validatePhoto(file) ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const sorted = sortImages(images.data ?? [])

  const upload = useMutation({
    mutationFn: () => uploadPhoto(productId, file!, alt, sorted.length === 0, crypto.randomUUID()),
    onSuccess: () => {
      notify('Photo uploaded')
      setFile(null)
      setAlt('')
      void qc.invalidateQueries({ queryKey: ['product-images', productId] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setProblem(f ? validatePhoto(f) : null)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const p = validatePhoto(file) ?? validateAlt(alt)
    setProblem(p)
    if (!p && !upload.isPending) upload.mutate()
  }

  return (
    <section className="panel" aria-label="Photos">
      <h2>Photos</h2>
      <p className="muted">
        Photos are public: they appear on the website once the product is published. JPEG, PNG or WebP, up to {MAX_PHOTO_BYTES / 1024 / 1024} MB each. The main photo is shown first.
      </p>
      <form onSubmit={submit} className="photo-upload" noValidate>
        <label className="field">
          <span>Photo</span>
          <input type="file" accept={PHOTO_TYPES.join(',')} onChange={choose} aria-invalid={Boolean(problem)} />
        </label>
        <label className="field">
          <span>Description (optional)</span>
          <input value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. Nova X1 in black, front view" />
        </label>
        {preview && <img className="photo-preview" src={preview} alt="Preview of the chosen photo" />}
        <Button type="submit" variant="primary" disabled={upload.isPending}>
          {upload.isPending ? 'Uploading…' : 'Upload photo'}
        </Button>
        {problem && <p role="alert" className="field-error">{problem}</p>}
      </form>

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
