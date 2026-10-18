import { checkIdentifier } from '../../lib/imei'
import type { PurchaseLine, ReceiveUnit } from '../../lib/types'

export interface UnitSlot {
  /** Stable key for React and focus handling. */
  key: string
  lineId: string
  /** 1-based position within its line. */
  position: number
}

/** One slot per physical phone, in line order. Quantity (accessory) lines produce none. */
export function buildSlots(lines: PurchaseLine[]): UnitSlot[] {
  const slots: UnitSlot[] = []
  for (const line of lines) {
    if (line.variant?.tracking_mode !== 'serialized') continue
    for (let i = 1; i <= line.quantity; i++) slots.push({ key: `${line.id}:${i}`, lineId: line.id, position: i })
  }
  return slots
}

export interface SlotStatus {
  /** Empty boxes have no error until the user tries to receive; `complete` tells them apart. */
  filled: boolean
  error: string | null
}

export interface ReceiveAnalysis {
  statuses: Record<string, SlotStatus>
  filledCount: number
  total: number
  /** True when every box is filled and none has an error (vacuously true when there are no phone boxes). */
  ready: boolean
  /** Payload for rpc/receive_purchase; only meaningful when `ready`. */
  units: ReceiveUnit[]
}

/** Validates every box and flags values that appear more than once in this delivery. */
export function analyseUnits(slots: UnitSlot[], values: Record<string, string>): ReceiveAnalysis {
  const checks = slots.map((s) => ({ slot: s, raw: values[s.key] ?? '' })).map((x) => ({ ...x, check: checkIdentifier(x.raw) }))
  const seen = new Map<string, number>()
  for (const c of checks) if (c.check.ok) seen.set(c.check.id.value, (seen.get(c.check.id.value) ?? 0) + 1)

  const statuses: Record<string, SlotStatus> = {}
  const units: ReceiveUnit[] = []
  let filledCount = 0
  let ready = true
  for (const { slot, raw, check } of checks) {
    const filled = raw.trim() !== ''
    if (filled) filledCount++
    let error: string | null = null
    if (filled && !check.ok) error = check.error
    else if (check.ok && (seen.get(check.id.value) ?? 0) > 1) error = 'Duplicate: entered more than once'
    statuses[slot.key] = { filled, error }
    if (!filled || error) ready = false
    else if (check.ok) {
      units.push(
        check.id.kind === 'imei'
          ? { purchase_item_id: slot.lineId, imei1: check.id.value }
          : { purchase_item_id: slot.lineId, serial_number: check.id.value },
      )
    }
  }
  return { statuses, filledCount, total: slots.length, ready, units }
}
