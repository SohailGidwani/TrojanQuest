import type { ReactNode } from 'react'
export type IconName = 'album' | 'quest' | 'friends' | 'guide' | 'pin' | 'search' | 'arrow' | 'sunrise' | 'sun' | 'moon' | 'lock' | 'close' | 'copy' | 'check' | 'spark' | 'external' | 'refresh' | 'back'
const paths: Record<IconName, ReactNode> = {
  album: <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 3v18m4-12 1.5-2L15 9l2 .7-1.3 1.7.1 2.1-2.3-.7-1.8 1 .1-2.2L10 10z"/></>,
  quest: <><path d="M5 20V4m0 1c5-5 9 5 14 0v10c-5 5-9-5-14 0"/><circle cx="5" cy="20" r="1"/></>,
  friends: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 6"/></>,
  guide: <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a8 8 0 1 1 16 0Z"/><path d="m9 9 1-1m4 0 1 1m-5 4c1 1 3 1 4 0"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  sunrise: <><path d="M3 18h18M5 14h14a7 7 0 0 0-14 0Zm7-12v3M3 7l2 2m16-2-2 2"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  moon: <path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>, copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  check: <path d="m5 12 4 4L20 5"/>,
  spark: <><path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/></>,
  external: <><path d="M14 3h7v7m0-7L10 14m1-9H4v15h15v-7"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5m10 0a7 7 0 0 0-12-6L4 9m16 6-3 3A7 7 0 0 1 5 12"/></>,
}
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
