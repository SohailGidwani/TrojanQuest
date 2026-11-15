import { useEffect, useRef, useId } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog?.open) dialog?.showModal()
    if (!open && dialog?.open) dialog.close()
    return () => { if (dialog?.open) dialog.close() }
  }, [open])
  return <dialog ref={ref} className="detail-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-inner"><header className="dialog-header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close details"><Icon name="close"/></button></header>{children}</div>
  </dialog>
}
