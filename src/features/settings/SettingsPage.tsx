import { useState } from 'react'
import { DiscountPolicySection } from './DiscountPolicySection'
import { ShopProfileSection } from './ShopProfileSection'
import { StaffSection } from './StaffSection'

type Tab = 'discounts' | 'shop' | 'staff'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'discounts', label: 'Discount policy' },
  { id: 'shop', label: 'Shop details' },
  { id: 'staff', label: 'Staff' },
]

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('discounts')
  return (
    <div>
      <h1>Settings</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'discounts' && <DiscountPolicySection />}
      {tab === 'shop' && <ShopProfileSection />}
      {tab === 'staff' && <StaffSection />}
    </div>
  )
}
