-- ============================================================================
-- CREDLINK DATABASE SCHEMA MIGRATION
-- Migration Version: 002_credential_revocation_fields.sql
-- Description: Adds non-destructive revocation metadata fields to public.credentials
-- ============================================================================

ALTER TABLE public.credentials
ADD COLUMN IF NOT EXISTS revocation_reason TEXT,
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Index for optimized lookup of credential status and revoked_at
CREATE INDEX IF NOT EXISTS idx_credentials_status ON public.credentials(status);
CREATE INDEX IF NOT EXISTS idx_credentials_revoked_at ON public.credentials(revoked_at) WHERE status = 'REVOKED';
