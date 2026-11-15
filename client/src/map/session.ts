export type CampusSession = { access_token: string } | null
export interface SessionSource {
  read(): Promise<CampusSession>
  subscribe(listener: (session: CampusSession) => void): () => void
}
export interface SessionState { ready: boolean; accessToken?: string; failed?: boolean }

/** Auth events win over an older, still-pending initial session read. */
export function observeSession(source: SessionSource, update: (state: SessionState) => void) {
  let active = true
  let changed = false
  const unsubscribe = source.subscribe(session => {
    changed = true
    if (active) update({ ready: true, accessToken: session?.access_token })
  })
  void source.read().then(session => {
    if (active && !changed) update({ ready: true, accessToken: session?.access_token })
  }).catch(() => {
    if (active && !changed) update({ ready: true, failed: true })
  })
  return () => { active = false; unsubscribe() }
}
