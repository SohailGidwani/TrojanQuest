import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../ai/contracts.js';

let admin: SupabaseClient | undefined;

/** Service credentials stay in this server module; never import it from the client. */
export function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError(503, 'Backend data requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  admin ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}

export function databaseFailure(error: { code?: string } | null): never {
  // Do not send SQL errors, connection details or secrets to a browser.
  if (error?.code === '42P01' || error?.code === '42883' || error?.code?.startsWith('PGRST2')) {
    throw new ApiError(503, 'Apply the backend Supabase migration before using data routes.');
  }
  throw new ApiError(503, 'The database is unavailable. Please try again.');
}
