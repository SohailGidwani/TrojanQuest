import type { ReactNode } from 'react'
import { Icon } from './Icon'
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }
export function PageHeading({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1><p>{children}</p></div>{aside}</header>
}
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><Icon name="spark" size={30}/><h3>{title}</h3><p>{children}</p>{action}</div>
}
