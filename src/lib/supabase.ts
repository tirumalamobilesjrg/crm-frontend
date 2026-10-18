import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readEnv } from './env'

const result = readEnv(import.meta.env as Record<string, string | undefined>)

export const envProblem: string | null = result.ok ? null : result.problem

// When the environment is invalid the app shows a configuration screen and never uses this client.
export const supabase: SupabaseClient = result.ok
  ? createClient(result.env.url, result.env.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : (null as unknown as SupabaseClient)
