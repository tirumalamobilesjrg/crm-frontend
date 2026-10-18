import { useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useTheme, type ThemeChoice } from '../lib/theme'
import type { StaffRole } from '../lib/types'
import { Icon, type IconName } from './icons'
import { useFocusTrap } from './useFocusTrap'

export interface NavItem {
  to: string
  label: string
  roles: StaffRole[]
  icon: IconName
  group: 'Sell' | 'Stock' | 'Catalogue' | 'Money' | 'Admin' | null
  end?: boolean
}

// Hiding a link is cosmetic: every protected action is checked again by the database.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', roles: ['admin', 'manager'], icon: 'home', group: null, end: true },
  { to: '/pos', label: 'New sale', roles: ['admin', 'manager'], icon: 'cart', group: 'Sell' },
  { to: '/sales', label: 'Sales', roles: ['admin', 'manager'], icon: 'receipt', group: 'Sell' },
  { to: '/customers', label: 'Customers', roles: ['admin', 'manager'], icon: 'users', group: 'Sell' },
  { to: '/inventory', label: 'Inventory', roles: ['admin', 'manager'], icon: 'box', group: 'Stock' },
  { to: '/purchasing/purchases', label: 'Purchases', roles: ['admin', 'manager'], icon: 'truck', group: 'Stock' },
  { to: '/purchasing/suppliers', label: 'Suppliers', roles: ['admin', 'manager'], icon: 'store', group: 'Stock' },
  { to: '/catalogue/products', label: 'Products', roles: ['admin', 'manager'], icon: 'tag', group: 'Catalogue' },
  { to: '/catalogue/setup', label: 'Brands & categories', roles: ['admin', 'manager'], icon: 'layers', group: 'Catalogue' },
  { to: '/expenses', label: 'Expenses', roles: ['admin', 'manager'], icon: 'wallet', group: 'Money' },
  { to: '/reports', label: 'Reports', roles: ['admin', 'manager'], icon: 'chart', group: 'Money' },
  { to: '/approvals', label: 'Discount approvals', roles: ['admin'], icon: 'approve', group: 'Admin' },
  { to: '/audit', label: 'Audit log', roles: ['admin'], icon: 'shield', group: 'Admin' },
  { to: '/settings', label: 'Settings', roles: ['admin'], icon: 'cog', group: 'Admin' },
]

const GROUPS: Array<NonNullable<NavItem['group']>> = ['Sell', 'Stock', 'Catalogue', 'Money', 'Admin']
const THEME_LABEL: Record<ThemeChoice, string> = { system: 'Match this device', light: 'Light', dark: 'Dark' }
const THEME_ICON: Record<ThemeChoice, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' }

export function Layout() {
  const { state, signOut } = useAuth()
  const { theme, cycle } = useTheme()
  const location = useLocation()
  // The phone drawer is open only on the page it was opened from, so choosing a page (or going back) closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === location.pathname
  const setOpen = (v: boolean) => setOpenAt(v ? location.pathname : null)
  const rail = useRef<HTMLElement>(null)
  useFocusTrap(rail, open, () => setOpen(false))
  if (state.status !== 'ready') return null
  const { profile } = state
  const items = NAV_ITEMS.filter((i) => i.roles.includes(profile.role))
  const link = (i: NavItem) => (
    <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
      <Icon name={i.icon} size={18} />
      <span>{i.label}</span>
    </NavLink>
  )

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon-btn" aria-label="Open menu" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
        <span className="topbar-brand">Tirumala Mobiles</span>
      </header>
      <div className="scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className="sidebar" id="main-nav" data-open={open} ref={rail}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="phone" size={18} />
          </span>
          <span>Tirumala Mobiles</span>
          <button className="icon-btn drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <nav aria-label="Main">
          {items.filter((i) => i.group === null).map(link)}
          {GROUPS.map((g) => {
            const inGroup = items.filter((i) => i.group === g)
            if (inGroup.length === 0) return null
            return (
              <div className="nav-group" key={g} role="group" aria-label={g}>
                <div className="nav-group-label">{g}</div>
                {inGroup.map(link)}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <span className="avatar" aria-hidden="true">
              {profile.full_name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="who-text">
              <strong>{profile.full_name}</strong>
              <small>{profile.role === 'admin' ? 'Admin' : 'Manager'}</small>
            </span>
          </div>
          <div className="foot-actions">
            <button className="foot-btn" onClick={cycle} aria-label={`Colour theme: ${THEME_LABEL[theme]}. Change`} title={`Colour theme: ${THEME_LABEL[theme]}`}>
              <Icon name={THEME_ICON[theme]} size={18} />
            </button>
            <button className="foot-btn foot-signout" onClick={() => void signOut()}>
              <Icon name="logout" size={18} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
