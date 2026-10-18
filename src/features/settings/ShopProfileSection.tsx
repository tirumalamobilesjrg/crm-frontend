import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadShopProfile, saveShopProfile } from '../../api/settings'
import { toAppError } from '../../lib/errors'
import type { ShopProfile } from '../../lib/types'
import { Button, ErrorBox, Loading, useToast } from '../../components/ui'
import { LIMITS, toForm, validateShopProfile, type ShopProfileForm } from './shopProfileValidation'

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </div>
  )
}

function ProfileForm({ profile }: { profile: ShopProfile }) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<ShopProfileForm>(toForm(profile))
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof ShopProfileForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: (p: ShopProfile) => saveShopProfile(p),
    onSuccess: () => {
      notify('Shop details saved')
      void qc.invalidateQueries({ queryKey: ['shop-profile'] })
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit() {
    const { error: problem, value } = validateShopProfile(form)
    setError(problem)
    if (value) save.mutate(value)
  }

  return (
    <section className="panel" aria-label="Shop details">
      <p className="muted">
        These details appear on the public website (contact page, footer, call and WhatsApp buttons). Leave a field empty to hide it. Do not enter anything you do not want customers to see.
      </p>
      <div className="grid-2">
        <Field label="Shop name" htmlFor="sp-name">
          <input id="sp-name" maxLength={LIMITS.shop_name} value={form.shop_name} onChange={set('shop_name')} />
        </Field>
        <Field label="Phone (shown on the website)" htmlFor="sp-phone">
          <input id="sp-phone" inputMode="tel" maxLength={LIMITS.phone} value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="WhatsApp number (empty = use the phone number)" htmlFor="sp-wa">
          <input id="sp-wa" inputMode="tel" maxLength={LIMITS.whatsapp} value={form.whatsapp} onChange={set('whatsapp')} />
        </Field>
        <Field label="Email" htmlFor="sp-email">
          <input id="sp-email" type="email" maxLength={LIMITS.email} value={form.email} onChange={set('email')} />
        </Field>
      </div>
      <Field label="Address" htmlFor="sp-address">
        <textarea id="sp-address" rows={3} maxLength={LIMITS.address} value={form.address} onChange={set('address')} />
      </Field>
      <Field label="Opening hours" htmlFor="sp-hours" hint="For example: Mon–Sat 10:00 am – 9:00 pm, Sunday closed">
        <textarea id="sp-hours" rows={2} maxLength={LIMITS.opening_hours} value={form.opening_hours} onChange={set('opening_hours')} />
      </Field>
      <Field label="Map link (https)" htmlFor="sp-map" hint="Open the shop in Google Maps, choose Share, and paste the link">
        <input id="sp-map" inputMode="url" maxLength={LIMITS.map_url} value={form.map_url} onChange={set('map_url')} />
      </Field>
      <Field label="About the shop" htmlFor="sp-about" hint="A few true sentences. Do not add awards, years in business or dealer claims unless they are verified.">
        <textarea id="sp-about" rows={4} maxLength={LIMITS.about} value={form.about} onChange={set('about')} />
      </Field>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <Button variant="primary" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save shop details'}
      </Button>
    </section>
  )
}

export function ShopProfileSection() {
  const q = useQuery({ queryKey: ['shop-profile'], queryFn: loadShopProfile })
  return (
    <div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox error={q.error} retry={() => void q.refetch()} />}
      {q.data && <ProfileForm key={JSON.stringify(q.data)} profile={q.data} />}
    </div>
  )
}
