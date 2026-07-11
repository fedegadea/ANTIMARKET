// GET /api/config — public runtime config for the panels (Supabase OTP auth).
// DECISIÓN: not in the spec's file tree, but the panels need the Supabase URL
// and anon key at runtime and hardcoding them in JS would couple deploys to envs.
// The anon key is public by design; RLS is the guard.
import { json, CACHE_PUBLIC } from '../lib/http.js';

export async function GET() {
  return json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  }, { headers: CACHE_PUBLIC });
}
