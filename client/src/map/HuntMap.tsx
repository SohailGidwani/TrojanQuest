import { useEffect } from 'react'
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { Position } from '../../../shared/types'
import type { LocationFix } from './navigation'
import 'leaflet/dist/leaflet.css'
function FollowPosition({ position }: { position: Position }) {
  const map = useMap()
  useEffect(() => { map.setView([position.lat, position.lng], map.getZoom(), { animate: false }) }, [map, position.lat, position.lng])
  return null
}
export function HuntMap({ target, fix, revealed }: { target: Position; fix: LocationFix | null; revealed: boolean }) {
  const center = fix ?? target
  return <div className="hunt-map" aria-label="North-up campus map"><MapContainer center={[center.lat, center.lng]} zoom={17} scrollWheelZoom={false} className="hunt-leaflet"><TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/><FollowPosition position={center}/>{fix ? <><Circle center={[fix.lat, fix.lng]} radius={fix.accuracy} pathOptions={{ color: '#527aaf', fillColor: '#7da6db', fillOpacity: .12, weight: 1 }}/><CircleMarker center={[fix.lat, fix.lng]} radius={8} pathOptions={{ color: '#fff', fillColor: '#3e77b3', fillOpacity: 1, weight: 3 }}><Tooltip>You are here</Tooltip></CircleMarker></> : null}{revealed ? <><Circle center={[target.lat, target.lng]} radius={50} pathOptions={{ color: '#39786e', fillColor: '#5d9b85', fillOpacity: .12, weight: 1 }}/><CircleMarker center={[target.lat, target.lng]} radius={9} pathOptions={{ color: '#fff', fillColor: '#8d1836', fillOpacity: 1, weight: 3 }}><Tooltip>Bovard Auditorium</Tooltip></CircleMarker></> : null}</MapContainer><span className="north-label">↑ N</span></div>
}
