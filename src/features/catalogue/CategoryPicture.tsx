import { useState } from 'react'
import { categoryImageUrl } from '../../api/categoryImages'
import { Button, Dialog } from '../../components/ui'
import { validateCategoryChosen } from './categoryImage'

/** A small rounded picture tile for a category row (the category's first letter when there is no picture). Decorative: the name is written next to it. */
export function CategoryThumb({ path, name }: { path: string | null; name: string }) {
  return (
    <span className="category-thumb" aria-hidden="true">
      {path ? <img src={categoryImageUrl(path)} alt="" loading="lazy" /> : <span className="brand-mark-initial">{name.trim().charAt(0).toUpperCase() || '+'}</span>}
    </span>
  )
}

/** Choose or replace the picture of one category, or remove it. */
export function CategoryPictureDialog(props: { name: string; path: string | null; busy: boolean; onChoose: (file: File) => void; onRemove: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog title={`Picture for ${props.name}`} onClose={props.onClose}>
      <div className="category-preview">
        <CategoryThumb path={props.path} name={props.name} />
        <p className="muted">
          Shown on the website's category tile. A clear photo or illustration works best; a landscape picture about 900 px wide is ideal. Big pictures are shrunk automatically.
        </p>
      </div>
      <div className="field">
        <label htmlFor="category-picture">{props.path ? 'Choose a new picture (JPEG, PNG or WebP)' : 'Choose a picture (JPEG, PNG or WebP)'}</label>
        <input
          id="category-picture"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={props.busy}
          aria-describedby={error ? 'category-picture-error' : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            const problem = validateCategoryChosen(file)
            setError(problem)
            if (file && !problem) props.onChoose(file)
          }}
        />
        {error && (
          <small id="category-picture-error" className="field-error" role="alert">
            {error}
          </small>
        )}
      </div>
      <div className="dialog-actions">
        {props.path && (
          <Button variant="danger" disabled={props.busy} onClick={props.onRemove}>
            Remove picture
          </Button>
        )}
        <Button onClick={props.onClose}>{props.busy ? 'Saving…' : 'Cancel'}</Button>
      </div>
    </Dialog>
  )
}
