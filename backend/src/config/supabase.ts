import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Public/Anon client for unprivileged or standard user operations
export const supabaseClient: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Admin / Service-Role client for backend server operations and system verification
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export interface DbHealthResult {
  status: 'connected' | 'disconnected';
  latencyMs?: number;
  error?: string;
}

/**
 * Safely checks database connectivity without exposing secret keys or sensitive infrastructure logs.
 */
export const checkDatabaseHealth = async (): Promise<DbHealthResult> => {
  const startTime = Date.now();
  try {
    // Perform a lightweight admin API check against Supabase Auth service
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const latencyMs = Date.now() - startTime;

    if (error) {
      return {
        status: 'disconnected',
        error: 'Unable to query authentication service',
      };
    }

    return {
      status: 'connected',
      latencyMs,
    };
  } catch (err) {
    return {
      status: 'disconnected',
      error: 'Supabase connectivity check failed',
    };
  }
};
