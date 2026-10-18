import { useState } from 'react'
import { DiscountPolicySection } from './DiscountPolicySection'
import { StaffSection } from './StaffSection'

export function SettingsPage() {
  const [tab, setTab] = useState<'discounts' | 'staff'>('discounts')
  return (
    <div>
      <h1>Settings</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'discounts'} className={tab === 'discounts' ? 'tab active' : 'tab'} onClick={() => setTab('discounts')}>
          Discount policy
        </button>
        <button role="tab" aria-selected={tab === 'staff'} className={tab === 'staff' ? 'tab active' : 'tab'} onClick={() => setTab('staff')}>
          Staff
        </button>
      </div>
      {tab === 'discounts' ? <DiscountPolicySection /> : <StaffSection />}
    </div>
  )
}
