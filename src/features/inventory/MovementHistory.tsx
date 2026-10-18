import { useQuery } from '@tanstack/react-query'
import { listStaff } from '../../api/settings'
import type { StockMovement } from '../../lib/types'
import { REASON_LABEL, STATUS_LABEL } from './logic'

const TYPE_LABEL = { purchase_receipt: 'Received', sale: 'Sold', adjustment: 'Adjustment' } as const

/** Read-only view of the append-only stock ledger for one device or one accessory SKU. */
export function MovementHistory({ movements, quantity }: { movements: StockMovement[]; quantity: boolean }) {
  // names for "who"; readable by both roles. If it cannot be read the column simply shows a dash.
  const staff = useQuery({ queryKey: ['staff-names'], queryFn: listStaff, staleTime: 60_000 })
  const name = (id: string | null) => (id ? staff.data?.find((s) => s.user_id === id)?.full_name ?? '—' : '—')

  if (movements.length === 0) return <p className="muted">No stock movements recorded.</p>
  return (
    <table className="table" aria-label="Stock movements">
      <thead>
        <tr>
          <th>When</th>
          <th>Type</th>
          <th>{quantity ? 'Change' : 'Status'}</th>
          {quantity && <th className="right">Balance</th>}
          <th>Reason and notes</th>
          <th>By</th>
        </tr>
      </thead>
      <tbody>
        {movements.map((m) => (
          <tr key={m.id}>
            <td>{new Date(m.created_at).toLocaleString()}</td>
            <td>{TYPE_LABEL[m.movement_type]}</td>
            <td>
              {quantity
                ? `${(m.quantity_delta ?? 0) > 0 ? '+' : ''}${m.quantity_delta ?? 0}`
                : `${m.from_status ? STATUS_LABEL[m.from_status] : '—'} → ${m.to_status ? STATUS_LABEL[m.to_status] : '—'}`}
            </td>
            {quantity && <td className="right">{m.balance_after ?? '—'}</td>}
            <td>{m.adjustment ? `${REASON_LABEL[m.adjustment.reason]}: ${m.adjustment.notes}` : '—'}</td>
            <td>{name(m.created_by)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
