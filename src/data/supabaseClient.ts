import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The single Supabase client (DESIGN.md §9). Uses only the publishable key —
 * every table is protected by RLS, so this key grants nothing on its own.
 * `null` when the env vars are missing (unit tests, misconfigured deploy);
 * main.tsx renders a configuration error instead of a blank page.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey) : null;
