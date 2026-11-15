import { useEffect, useRef, useState } from 'react'
import type { LocationFix } from './navigation'

export function useLocation() {
  const [fix, setFix] = useState<LocationFix | null>(null)
  const [tracking, setTracking] = useState(false)
  const [error, setError] = useState('')
  const watch = useRef<number | null>(null)
  const generation = useRef(0)
  function stop() {
    generation.current++
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current)
    watch.current = null; setTracking(false); setFix(null)
  }
  function start() {
    stop(); setError('')
    if (!window.isSecureContext) { setError('Location needs HTTPS on a phone, or localhost on this computer.'); return }
    if (!navigator.geolocation) { setError('Location is unavailable in this browser.'); return }
    const current = generation.current
    setTracking(true)
    watch.current = navigator.geolocation.watchPosition(position => {
      if (current !== generation.current) return
      setError(''); setFix({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp })
    }, cause => {
      if (current !== generation.current) return
      setFix(null)
      setError(cause.code === 1 ? 'Location permission is off. Allow it in your browser settings, then try again.' : cause.code === 3 ? 'The location fix timed out. Try again outdoors with a clear view of the sky.' : 'Your location is unavailable right now. Try again outside.')
      if (cause.code === 1) stop()
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 })
  }
  useEffect(() => () => {
    generation.current++
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current)
  }, [])
  return { fix, tracking, error, start, stop }
}
