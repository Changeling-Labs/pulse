// Pulse Cloud Sync — public Supabase configuration.
//
// SUPABASE_PUBLISHABLE_KEY is the public "publishable" key for the Pulse sync
// project (https://kjlmkmkjkzbbnzdpvjhkxz.supabase.co). It is designed to be
// public: it can only be used during the magic-link auth flow and to reach
// rows the row-level security policies strictly isolate (`auth.uid() = user_id`).
// The service_role key is NEVER used here and must never be committed.
//
// Deploy note: these values are baked into the static bundle (same model as
// every Supabase client app). Their exposure is intentional and safe.
export const SUPABASE_URL = 'https://kjlmkmkjkzbbnzdpvjhkxz.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5w93zJNuHD9GtNFy4x71ZQ_BgrEDm-1';
