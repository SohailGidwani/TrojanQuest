import { useEffect, useState } from 'react'
import type { CatchResult, Spot } from '../../../shared/types'
import { useLocation } from '../map/useLocation'
import { proximity } from '../map/navigation'

export function LiveSpotCatch({ spot, onCollect }: { spot: Spot; onCollect: (id: string, point: { lat: number; lng: number }) => Promise<CatchResult> }) {
  const gps = useLocation(), [now, setNow] = useState(Date.now), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const status = proximity(spot, gps.fix, now)
  async function collect() {
    if (busy || !gps.fix || !proximity(spot, gps.fix).canCollect) return
    setBusy(true); setNotice('')
    try { const result = await onCollect(spot.id, gps.fix); setNotice(result.ok ? result.already_caught ? 'This edition is already saved.' : `Your ${result.variant} edition is saved.` : 'The server could not collect this stop. Check its availability and move within 50 m.') }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Collection could not be confirmed. Please retry.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Collect at this place"><button className="button secondary" onClick={gps.start}>Use my location</button>{gps.tracking ? <button className="text-button" onClick={gps.stop}>Pause location</button> : null}<p>{status.distance == null ? 'Enable location when you are near this place.' : `${Math.round(status.distance)} m away · location accuracy ±${Math.round(gps.fix?.accuracy ?? 0)} m`}</p>{gps.error ? <p role="alert">{gps.error}</p> : null}<button className="button primary full-width" disabled={busy || !status.canCollect} onClick={() => void collect()}>{busy ? 'Collecting…' : 'Collect this stop'}</button>{notice ? <p role="status">{notice}</p> : null}<p className="quiet-note">A fresh, accurate location fix must fit within the 50 m circle. Stay on safe public paths; entering a building is not required.</p></section>
}
