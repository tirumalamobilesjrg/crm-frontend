import type { SVGProps } from 'react'

// A small, consistent line-icon set (24x24, 1.75 stroke). Hand-drawn shapes, no icon dependency.
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  cart: 'M3 4h2l2.2 11h10.6L20 7H6.2 M9.5 20h.01 M17.5 20h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 15.3c2 .6 3.2 2 3.5 4.7',
  box: 'M12 3 4 7v10l8 4 8-4V7z M4 7l8 4 8-4 M12 11v10',
  truck: 'M3 6h11v10H3z M14 9h4l3 3v4h-7z M7 19h.01 M17 19h.01',
  store: 'M4 9l1-5h14l1 5 M4 9v11h16V9 M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0 M10 20v-5h4v5',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 8.5h.01',
  layers: 'M12 3 3 8l9 5 9-5z M3 13l9 5 9-5',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v4 M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z M16.5 14.5h.01',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  approve: 'M12 3l2.4 1.7 3-.2 1 2.8 2.3 1.9-.9 2.9.9 2.9-2.3 1.9-1 2.8-3-.2L12 21l-2.4-1.7-3 .2-1-2.8-2.3-1.9.9-2.9-.9-2.9 2.3-1.9 1-2.8 3 .2z M8.5 12l2.5 2.5 4.5-5',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z M9 12l2 2 4-4',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-1.7-1L15 3.4h-4l-.3 2.5a7.6 7.6 0 0 0-1.7 1L6.6 6l-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4.9 2-3.4z',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  close: 'M6 6l12 12 M18 6 6 18',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  monitor: 'M3 5h18v11H3z M8 20h8 M12 16v4',
  logout: 'M9 4H5v16h4 M16 8l4 4-4 4 M20 12H9',
  plus: 'M12 5v14 M5 12h14',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 18h2',
  alert: 'M12 4 2.5 20h19z M12 10v4 M12 17h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
} as const

export type IconName = keyof typeof PATHS

/** Decorative by default (aria-hidden); pass a `title` when the icon stands alone. */
export function Icon({ name, size = 20, title, ...rest }: { name: IconName; size?: number; title?: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {PATHS[name].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  )
}
