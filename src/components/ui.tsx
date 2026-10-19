import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode,
} from 'react'
import { Icon, type IconName } from './icons'
import { useFocusTrap } from './useFocusTrap'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

/** Full-area branded loader: the shop emblem inside a turning gold ring. Used while the session is being checked. */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-loader" role="status">
      <span className="loader-mark" aria-hidden="true">
        <img src="/logo-192.png" alt="" width={64} height={64} />
      </span>
      <span className="loader-label">{label}</span>
    </div>
  )
}

/** A block of grey bars where content will appear (decorative; pair with a Loading status for screen readers). */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  )
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="error-box" role="alert">
      <Icon name="alert" size={18} />
      <span>{message}</span>
      {retry && (
        <button className="btn btn-small" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  )
}

/** For a list or page with nothing in it yet: says what this is and what to do next. */
export function EmptyState({ icon = 'box', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  small?: boolean
}

export function Button({ variant = 'secondary', small, className = '', ...rest }: ButtonProps) {
  return <button {...rest} className={`btn btn-${variant}${small ? ' btn-small' : ''} ${className}`.trim()} />
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

interface FieldProps {
  label: string
  error?: string | undefined
  hint?: string | undefined
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && (
        <small id={`${id}-hint`} className="hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-err`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

let openDialogs = 0

/** Modal dialog: focus moves in and stays in, Escape and the backdrop close it, focus returns to what opened it, the page behind does not scroll. */
export function Dialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(ref, true, onClose)
  useEffect(() => {
    openDialogs++
    document.body.style.overflow = 'hidden'
    return () => {
      openDialogs--
      if (openDialogs === 0) document.body.style.overflow = ''
    }
  }, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  /** Style the confirm button as destructive. */
  danger?: boolean
}
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

/** Replaces window.confirm: resolves true on the confirm button, false on Cancel, Escape, the X or the backdrop. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null)
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })), [])
  const answer = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Dialog title={pending.options.title ?? 'Please confirm'} onClose={() => answer(false)} className="confirm-dialog">
          <p>{pending.options.message}</p>
          <div className="dialog-actions">
            <Button onClick={() => answer(false)}>Cancel</Button>
            <Button variant={pending.options.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
              {pending.options.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ToastProvider>')
  return ctx
}

interface Toast {
  id: number
  tone: 'good' | 'bad'
  text: string
}
const ToastContext = createContext<{ notify: (text: string, tone?: 'good' | 'bad') => void } | null>(null)
const MAX_TOASTS = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tone, text }].slice(-MAX_TOASTS))
    // Failures stay long enough to be read (12 s, and they have a dismiss button); success fades after 6 s.
    setTimeout(() => dismiss(id), tone === 'bad' ? 12_000 : 6000)
  }, [dismiss])
  const value = useMemo(() => ({ notify }), [notify])
  return (
    <ToastContext.Provider value={value}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'bad' ? 'alert' : 'status'}>
            <Icon name={t.tone === 'bad' ? 'alert' : 'check'} size={18} />
            <span>{t.text}</span>
            <button className="icon-btn" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Pagination">
      <Button small disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page} of {pages}
      </span>
      <Button small disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  )
}

/**
 * Tab list with the WAI-ARIA tabs pattern: only the selected tab is in the Tab order, Left/Right/Home/End move between tabs
 * (and select them), and the content is a tabpanel labelled by its tab.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, children }: {
  tabs: ReadonlyArray<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
  label: string
  children: ReactNode
}) {
  const base = useId()
  const refs = useRef(new Map<T, HTMLButtonElement>())
  function onKeyDown(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === value)
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    const id = tabs[next]!.id
    onChange(id)
    refs.current.get(id)?.focus()
  }
  return (
    <>
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={value === t.id}
            aria-controls={`${base}-panel`}
            tabIndex={value === t.id ? 0 : -1}
            ref={(el) => { if (el) refs.current.set(t.id, el); else refs.current.delete(t.id) }}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`}>
        {children}
      </div>
    </>
  )
}
