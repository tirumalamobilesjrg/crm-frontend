import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import type { StaffRole } from '../lib/types'
import { Badge } from './ui'

export interface NavItem {
  to: string
  label: string
  roles: StaffRole[]
  end?: boolean
}

// Hiding a link is cosmetic: every protected action is checked again by the database.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', roles: ['admin', 'manager'], end: true },
  { to: '/catalogue/products', label: 'Products', roles: ['admin', 'manager'] },
  { to: '/catalogue/setup', label: 'Brands & categories', roles: ['admin', 'manager'] },
  { to: '/inventory', label: 'Inventory', roles: ['admin', 'manager'] },
  { to: '/purchasing/purchases', label: 'Purchases', roles: ['admin', 'manager'] },
  { to: '/purchasing/suppliers', label: 'Suppliers', roles: ['admin', 'manager'] },
  { to: '/settings', label: 'Settings', roles: ['admin'] },
]

export function Layout() {
  const { state, signOut } = useAuth()
  if (state.status !== 'ready') return null
  const { profile } = state
  const items = NAV_ITEMS.filter((i) => i.roles.includes(profile.role))
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Tirumala Mobiles</div>
        <nav aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
              {i.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="who">
            {profile.full_name} <Badge tone={profile.role === 'admin' ? 'good' : 'neutral'}>{profile.role === 'admin' ? 'Admin' : 'Manager'}</Badge>
          </span>
          <button className="btn btn-secondary btn-small" onClick={() => void signOut()}>
            Sign out
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
