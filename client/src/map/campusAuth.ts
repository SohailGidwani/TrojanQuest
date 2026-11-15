import { createClient } from '@supabase/supabase-js'
let client: ReturnType<typeof createClient> | undefined
export function campusAuth() {
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Campus sign-in is not configured.')
  return client ??= createClient(url, key, { auth: { detectSessionInUrl: true } })
}
