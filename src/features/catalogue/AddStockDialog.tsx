import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addPurchaseLine, createPurchase, listSuppliers } from '../../api/purchasing'
import { toAppError } from '../../lib/errors'
import type { Variant } from '../../lib/types'
import { Button, Dialog, Field, useToast } from '../../components/ui'
import { todayLocal, validateLine, validatePurchase, type LineForm, type PurchaseForm } from '../purchasing/validation'

/**
 * "Add stock" for one variant. Stock only ever enters through a purchase (the database keeps a ledger of what came from whom),
 * so this starts a draft purchase with this variant as its first line and opens it: phones then get one IMEI box each, and
 * pressing "Receive stock" there is what actually adds them.
 */
export function AddStockDialog({ variant, productName, onClose }: { variant: Variant; productName: string; onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers })
  const [purchase, setPurchase] = useState<PurchaseForm>({ supplier_id: '', invoiceNo: '', invoiceDate: todayLocal(), notes: '' })
  const [line, setLine] = useState<Pick<LineForm, 'quantity' | 'unitCost'>>({ quantity: '1', unitCost: '' })
  const [errors, setErrors] = useState<ReturnType<typeof validatePurchase> & ReturnType<typeof validateLine>['errors']>({})
  const isPhone = variant.tracking_mode === 'serialized'
  const label = [productName, variant.color, variant.storage_gb ? `${variant.storage_gb} GB` : null].filter(Boolean).join(' ')

  const start = useMutation({
    mutationFn: async (v: { quantity: number; unit_cost: number }) => {
      const p = await createPurchase({
        supplier_id: purchase.supplier_id,
        supplier_invoice_no: purchase.invoiceNo.trim(),
        invoice_date: purchase.invoiceDate,
        notes: null,
      })
      try {
        await addPurchaseLine({ purchase_id: p.id, variant_id: variant.id, ...v })
        return { id: p.id, lineError: null }
      } catch (e) {
        return { id: p.id, lineError: toAppError(e).message } // the draft exists; staff can add the line there
      }
    },
    onSuccess: ({ id, lineError }) => {
      void qc.invalidateQueries({ queryKey: ['purchases'] })
      if (lineError) notify(`Draft purchase created, but this item could not be added: ${lineError} Add it on the purchase page.`, 'bad')
      else notify(isPhone ? 'Now enter the IMEI of each phone, then press Receive stock.' : 'Check the details, then press Receive stock.')
      navigate(`/purchasing/purchases/${id}`)
    },
    onError: (e) => notify(toAppError(e).message, 'bad'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const p = validatePurchase(purchase)
    const l = validateLine({ variant_id: variant.id, ...line })
    setErrors({ ...p, ...l.errors })
    if (Object.keys(p).length === 0 && l.value) start.mutate({ quantity: l.value.quantity, unit_cost: l.value.unit_cost })
  }

  const noSuppliers = suppliers.data?.length === 0
  return (
    <Dialog title={`Add stock: ${label}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted">
          {isPhone
            ? 'Enter what you bought. On the next screen you scan or type the IMEI of each phone, and stock is added when you press Receive stock.'
            : 'Enter what you bought. On the next screen you check it, and stock is added when you press Receive stock.'}
        </p>
        <Field
          label="Supplier"
          error={errors.supplier_id}
          hint={noSuppliers ? undefined : 'Who you bought it from.'}
        >
          {(p) => (
            <select {...p} value={purchase.supplier_id} onChange={(e) => setPurchase((f) => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">{suppliers.isPending ? 'Loading…' : 'Choose…'}</option>
              {suppliers.data?.filter((s) => s.is_active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {noSuppliers && (
          <p className="muted">
            There are no suppliers yet. <Link to="/purchasing/suppliers">Add a supplier</Link> first.
          </p>
        )}
        <div className="grid-2">
          <Field label="Supplier invoice number" error={errors.invoiceNo} hint="From the bill you received.">
            {(p) => <input {...p} value={purchase.invoiceNo} maxLength={64} onChange={(e) => setPurchase((f) => ({ ...f, invoiceNo: e.target.value }))} />}
          </Field>
          <Field label="Invoice date" error={errors.invoiceDate}>
            {(p) => <input {...p} type="date" value={purchase.invoiceDate} onChange={(e) => setPurchase((f) => ({ ...f, invoiceDate: e.target.value }))} />}
          </Field>
        </div>
        <div className="grid-2">
          <Field label={isPhone ? 'Number of phones' : 'Quantity'} error={errors.quantity}>
            {(p) => <input {...p} inputMode="numeric" value={line.quantity} onChange={(e) => setLine((f) => ({ ...f, quantity: e.target.value }))} />}
          </Field>
          <Field label="Cost per unit (₹)" error={errors.unitCost} hint="What you paid, not the selling price.">
            {(p) => <input {...p} inputMode="decimal" value={line.unitCost} onChange={(e) => setLine((f) => ({ ...f, unitCost: e.target.value }))} />}
          </Field>
        </div>
        <div className="dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={start.isPending || noSuppliers}>
            {start.isPending ? 'Starting…' : 'Continue'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
