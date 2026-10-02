import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file from backend root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().min(1, 'SUPABASE_URL is required').url('SUPABASE_URL must be a valid URL'),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1, 'SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) is required'),
  SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required'),
  FRONTEND_URL: z.string().default('https://cred-link.vercel.app'),
  ISSUER_DID: z.string().min(1, 'ISSUER_DID is required'),
  ISSUER_KEY_ID: z.string().min(1, 'ISSUER_KEY_ID is required'),
  ISSUER_PRIVATE_KEY_HEX: z.string().min(1, 'ISSUER_PRIVATE_KEY_HEX is required'),
});

const rawEnv = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  FRONTEND_URL: process.env.FRONTEND_URL,
  ISSUER_DID: process.env.ISSUER_DID,
  ISSUER_KEY_ID: process.env.ISSUER_KEY_ID,
  ISSUER_PRIVATE_KEY_HEX: process.env.ISSUER_PRIVATE_KEY_HEX,
};

const parseEnv = () => {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const missingOrInvalidKeys = result.error.issues.map((issue) => issue.path.join('.'));
    console.error(`[FATAL] Missing or invalid environment variable(s): ${missingOrInvalidKeys.join(', ')}`);
    console.error('Please check your .env file in the backend root directory.');
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
