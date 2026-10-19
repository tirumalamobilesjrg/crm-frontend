import { useEffect, useMemo, useState } from 'react'
import { brandLogoUrl } from '../../api/brandLogos'
import { Button, Dialog } from '../../components/ui'
import { CURATED_LOGOS, loadLogoPreview, matchLogos, validateLogoFile, type CuratedLogo, type LogoChoice } from './logoGallery'

/** A small white tile that holds a logo (or the brand's first letter when there is none). Decorative: the brand name is written next to it. */
export function BrandMark({ src, name, size = 36 }: { src?: string | null | undefined; name: string; size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="brand-mark-initial">{name.trim().charAt(0).toUpperCase() || '+'}</span>}
    </span>
  )
}

/** The logo of a brand that is already saved. */
export const SavedBrandMark = ({ path, name, size }: { path: string | null; name: string; size?: number }) => (
  <BrandMark src={path ? brandLogoUrl(path) : null} name={name} {...(size ? { size } : {})} />
)

function useCuratedPreview(slug: string): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadLogoPreview(slug).then((url) => live && setSrc(url), () => undefined)
    return () => {
      live = false
    }
  }, [slug])
  return src
}

const CuratedMark = ({ logo, size }: { logo: CuratedLogo; size?: number }) => <BrandMark src={useCuratedPreview(logo.slug)} name={logo.name} {...(size ? { size } : {})} />

/** The logo a brand form is about to use, whether it came from the gallery or from the staff member's own file. */
export function ChoiceMark({ choice, name, size }: { choice: LogoChoice | null; name: string; size?: number }) {
  const file = choice?.kind === 'file' ? choice.file : null
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  if (choice?.kind === 'curated') return <CuratedMark logo={choice.logo} {...(size ? { size } : {})} />
  return <BrandMark src={url} name={name} {...(size ? { size } : {})} />
}

function LogoOption({ logo, onPick }: { logo: CuratedLogo; onPick: () => void }) {
  return (
    <button type="button" className="logo-option" onClick={onPick}>
      <CuratedMark logo={logo} size={56} />
      <span>{logo.name}</span>
    </button>
  )
}

/** Gallery of curated logos with search, plus uploading the brand's own PNG/WebP and removing the current logo. */
export function LogoPickerDialog(props: { brandName: string; hasLogo: boolean; onChoose: (choice: LogoChoice) => void; onRemove?: () => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const shown = matchLogos(search)
  return (
    <Dialog title={props.brandName ? `Logo for ${props.brandName}` : 'Choose a logo'} onClose={props.onClose}>
      <div className="field">
        <label htmlFor="logo-search">Search the gallery ({CURATED_LOGOS.length} brands)</label>
        <input id="logo-search" type="search" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Samsung, realme, JBL…" />
      </div>
      <div className="logo-grid" role="group" aria-label="Brand logos">
        {shown.map((l) => (
          <LogoOption key={l.slug} logo={l} onPick={() => props.onChoose({ kind: 'curated', logo: l })} />
        ))}
        {shown.length === 0 && <p className="muted">No logo in the gallery matches. Upload your own below.</p>}
      </div>
      <div className="field">
        <label htmlFor="logo-file">Or upload your own (PNG or WebP, up to 256 KB)</label>
        <input
          id="logo-file"
          type="file"
          accept="image/png,image/webp"
          aria-describedby={fileError ? 'logo-file-error' : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            const problem = validateLogoFile(file)
            setFileError(problem)
            if (file && !problem) props.onChoose({ kind: 'file', file })
          }}
        />
        {fileError && (
          <small id="logo-file-error" className="field-error" role="alert">
            {fileError}
          </small>
        )}
      </div>
      <div className="dialog-actions">
        {props.hasLogo && props.onRemove && (
          <Button variant="danger" onClick={props.onRemove}>
            Remove logo
          </Button>
        )}
        <Button onClick={props.onClose}>Cancel</Button>
      </div>
    </Dialog>
  )
}
