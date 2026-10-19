import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode,
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
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
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
    setTimeout(() => dismiss(id), tone === 'bad' ? 8000 : 3500)
  }, [dismiss])
  const value = useMemo(() => ({ notify }), [notify])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
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
