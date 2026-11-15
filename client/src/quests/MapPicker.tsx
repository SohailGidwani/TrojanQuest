import { useState } from 'react'
import { Circle, CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { campusCenter, campusRadiusMeters, onCampus } from '../components/customQuests'

type Point = { lat: number; lng: number }
function ClickToPlace({ onPick }: { onPick: (point: Point) => void }) {
  useMapEvents({ click: event => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }) })
  return null
}
/** Tap the map (or use your location) to pin a quest stop. Pins must fall inside the dashed campus circle. */
export function MapPicker({ value, onChange, label }: { value: Point | null; onChange: (point: Point) => void; label: string }) {
  const [note, setNote] = useState('')
  const [locating, setLocating] = useState(false)
  function place(point: Point) {
    if (!onCampus(point)) { setNote('Pins must be on campus, inside the dashed circle.'); return }
    setNote(''); onChange(point)
  }
  function locateMe() {
    if (!navigator.geolocation) { setNote('Location isn’t available in this browser. Tap the map instead.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(position => { setLocating(false); place({ lat: position.coords.latitude, lng: position.coords.longitude }) },
      () => { setLocating(false); setNote('Couldn’t get your location. Tap the map instead.') }, { enableHighAccuracy: true, timeout: 10_000 })
  }
  return <div className="map-picker">
    <div className="map-picker-map" aria-label={label}>
      <MapContainer center={[value?.lat ?? campusCenter.lat, value?.lng ?? campusCenter.lng]} zoom={16} scrollWheelZoom={false} className="hunt-leaflet">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>
        <Circle center={[campusCenter.lat, campusCenter.lng]} radius={campusRadiusMeters} pathOptions={{ color: '#990000', weight: 1.5, fillOpacity: .03, dashArray: '6 6' }}/>
        <ClickToPlace onPick={place}/>
        {value ? <CircleMarker center={[value.lat, value.lng]} radius={10} pathOptions={{ color: '#fff', fillColor: '#990000', fillOpacity: 1, weight: 3 }}/> : null}
      </MapContainer>
    </div>
    <div className="map-picker-bar"><span>{value ? `Pinned at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Tap the map to drop a pin.'}</span><button type="button" className="text-button" disabled={locating} onClick={locateMe}>{locating ? 'Locating…' : 'Use my location'}</button></div>
    {note ? <p className="form-error" role="status">{note}</p> : null}
  </div>
}
