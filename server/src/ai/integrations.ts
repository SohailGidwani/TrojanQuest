import { access } from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type PopupStore } from './contracts.js';

let authClient: SupabaseClient | undefined;
export async function authenticate(token: string): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError(503, 'Supabase email auth is not configured.');
  authClient ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'Invalid or expired session.');
  if (data.user.is_anonymous || !data.user.email_confirmed_at || !data.user.email?.toLowerCase().endsWith('@usc.edu')) {
    throw new ApiError(403, 'Sign in with a verified @usc.edu email.');
  }
  return data.user.id;
}

export async function getStore(): Promise<PopupStore> {
  const moduleUrl = new URL('../db/popups.ts', import.meta.url);
  try { await access(moduleUrl); }
  catch { throw new ApiError(503, "Kartik's server/src/db/popups.ts helpers are not available yet."); }
  const store = await import(moduleUrl.href) as Partial<PopupStore>;
  if (typeof store.createPopup !== 'function' || typeof store.findNearbyPopup !== 'function') {
    throw new ApiError(503, 'The popup database module must export createPopup and findNearbyPopup.');
  }
  return store as PopupStore;
}
