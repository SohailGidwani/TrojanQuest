import { useState } from 'react'
import type { FormEvent } from 'react'
import { Card, PageHeading } from '../components/Card'
import { campusAuth } from './campusAuth'

export function CampusSignIn() {
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      const address = email.trim().toLowerCase()
      if (!/^[^\s@]+@usc\.edu$/.test(address)) throw new Error('Use your USC email address.')
      const auth = campusAuth().auth
      const result = sent ? await auth.verifyOtp({ email: address, token: code.trim(), type: 'email' }) : await auth.signInWithOtp({ email: address, options: { emailRedirectTo: window.location.origin + '/hunt' } })
      if (result.error) throw new Error(sent ? 'That code could not be verified. Check the email or request a new code.' : 'The sign-in email could not be sent. The project may still require its email sender setup.')
      setSent(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in is unavailable.') }
    finally { setBusy(false) }
  }
  return <><PageHeading title="Sign in to your campus collection">Use your verified USC account to save discoveries, join parties and submit challenges.</PageHeading><Card><form onSubmit={submit}><label className="field-label" htmlFor="campus-email">USC email</label><input id="campus-email" className="text-field" type="email" autoComplete="email" required value={email} disabled={sent} onChange={e => setEmail(e.target.value)}/>{sent ? <><p>Open the sign-in link in your email, or enter the code if your email includes one. Email delivery depends on the project’s configured sender.</p><label className="field-label" htmlFor="campus-code">Email code</label><input id="campus-code" className="text-field" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required/></> : null}<div className="creator-actions"><button className="button primary" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Verify code' : 'Send sign-in code'}</button>{sent ? <button type="button" className="text-button" disabled={busy} onClick={() => { setSent(false); setCode('') }}>Use another email or resend</button> : null}</div>{error ? <p role="alert" className="form-error">{error}</p> : null}</form></Card></>
}
