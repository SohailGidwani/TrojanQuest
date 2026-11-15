import { useState } from 'react'
import type { CollectionData } from './useCollection'
import { Card } from './Card'
export function ProfileSetup({ data }: { data: CollectionData }) {
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (data.isDemo || data.mode !== 'live' || data.profile) return null
  return <Card><h2>Your traveller profile</h2><p>Save a display name to receive a friend code and submit challenges.</p><form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await data.saveProfile(name.trim()) } catch { setError('Your profile could not be saved. Please retry.') } finally { setBusy(false) } }}><label className="field-label" htmlFor="traveller-name">Display name</label><input id="traveller-name" className="text-field" required minLength={1} maxLength={40} value={name} onChange={e => setName(e.target.value)}/><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>{error ? <p role="alert">{error}</p> : null}</form></Card>
}
