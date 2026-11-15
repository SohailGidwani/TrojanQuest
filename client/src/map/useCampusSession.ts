import { useEffect, useState } from 'react'
import { observeSession } from './session'
import type { SessionState } from './session'

/** Restore an existing session only. Email sign-in remains the app shell's job. */
export function useCampusSession(enabled: boolean): SessionState {
  const [state, setState] = useState<SessionState>({ ready: false })
  useEffect(() => {
    if (!enabled) return
    let active = true
    let release = () => {}
    async function restore() {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        if (!active) return
        const url = import.meta.env.VITE_SUPABASE_URL
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        if (!url || !key) throw new Error('Public Supabase configuration is missing.')
        const client = createClient(url, key, { auth: { detectSessionInUrl: false } })
        setState({ ready: false })
        const stop = observeSession({
          async read() {
            const { data, error } = await client.auth.getSession()
            if (error) throw error
            return data.session
          },
          subscribe(listener) {
            const { data } = client.auth.onAuthStateChange((_event, session) => listener(session))
            return () => data.subscription.unsubscribe()
          },
        }, setState)
        release = () => { stop(); client.auth.stopAutoRefresh() }
      } catch { if (active) setState({ ready: true, failed: true }) }
    }
    void restore()
    return () => { active = false; release() }
  }, [enabled])
  return enabled ? state : { ready: true }
}
