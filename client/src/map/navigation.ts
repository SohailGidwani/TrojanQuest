import type { Position } from '../../../shared/types'
export interface LocationFix extends Position { accuracy: number; timestamp: number }
const radians = Math.PI / 180
export function distanceMetres(a: Position, b: Position) {
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
export function bearingDegrees(a: Position, b: Position) {
  const delta = (b.lng - a.lng) * radians
  const y = Math.sin(delta) * Math.cos(b.lat * radians)
  const x = Math.cos(a.lat * radians) * Math.sin(b.lat * radians) - Math.sin(a.lat * radians) * Math.cos(b.lat * radians) * Math.cos(delta)
  return (Math.atan2(y, x) / radians + 360) % 360
}
export function compassDirection(bearing: number) { return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(bearing / 45) % 8] }
export function proximity(target: Position, fix: LocationFix | null, now = Date.now()) {
  const valid = fix && Number.isFinite(fix.lat) && Math.abs(fix.lat) <= 90 && Number.isFinite(fix.lng) && Math.abs(fix.lng) <= 180 && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && Number.isFinite(fix.timestamp)
  if (!valid) return { state: 'waiting' as const, canCollect: false, distance: null, bearing: null }
  const distance = distanceMetres(fix, target), bearing = bearingDegrees(fix, target)
  if (now - fix.timestamp > 30_000 || fix.timestamp > now + 5000) return { state: 'stale' as const, canCollect: false, distance, bearing }
  if (fix.accuracy > 25) return { state: 'uncertain' as const, canCollect: false, distance, bearing }
  const canCollect = distance + fix.accuracy <= 50
  return { state: canCollect ? 'arrived' as const : 'searching' as const, canCollect, distance, bearing }
}
export function campusVariant(date = new Date()): 'morning' | 'day' | 'night' {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(date))
  return hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : 'night'
}
