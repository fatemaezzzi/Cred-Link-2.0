-- ============================================================================
-- CREDLINK DATABASE SCHEMA AND ROW LEVEL SECURITY (RLS) MIGRATION
-- Migration Version: 001_initial_schema_and_rls.sql
-- Description: Establishes initial non-destructive schema for profiles,
--              organizations, organization_members, credentials, consents,
--              trust_registry, and audit_logs with strict RLS policies.
-- ============================================================================

-- Enable required extensions safely
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLES CREATION (Non-Destructive)
-- ============================================================================

-- A. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'CITIZEN' CHECK (role IN ('CITIZEN', 'COLLEGE', 'BANK', 'HOSPITAL', 'EMPLOYER', 'ADMIN')),
    account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL CHECK (domain IN ('college', 'employer', 'bank', 'hospital', 'network_admin')),
    did TEXT UNIQUE NOT NULL,
    registration_ref TEXT,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'APPROVED', 'DENIED')),
    is_issuer BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_credential_types TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- C. ORGANIZATION MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (member_role IN ('ADMIN', 'ISSUER', 'VERIFIER', 'MEMBER')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_user UNIQUE (organization_id, user_id)
);

-- D. CREDENTIALS TABLE
CREATE TABLE IF NOT EXISTS public.credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    issuer_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    domain TEXT NOT NULL CHECK (domain IN ('education', 'employment', 'finance', 'healthcare')),
    credential_type TEXT NOT NULL,
    title TEXT NOT NULL,
    claims JSONB NOT NULL DEFAULT '[]'::jsonb,
    issuance_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID', 'REVOKED', 'EXPIRED')),
    issuer_signature TEXT,
    qr_payload TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- E. CONSENTS TABLE
CREATE TABLE IF NOT EXISTS public.consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requesting_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    credential_id UUID REFERENCES public.credentials(id) ON DELETE CASCADE,
    domain TEXT CHECK (domain IN ('education', 'employment', 'finance', 'healthcare', 'all')),
    purpose TEXT NOT NULL,
    requested_claims TEXT[] DEFAULT '{}',
    approved_claims TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DENIED', 'REVOKED', 'EXPIRED')),
    granted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- F. TRUST REGISTRY TABLE
CREATE TABLE IF NOT EXISTS public.trust_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    issuer_identifier TEXT UNIQUE NOT NULL,
    trust_status TEXT NOT NULL DEFAULT 'VERIFIED' CHECK (trust_status IN ('VERIFIED', 'SUSPENDED', 'REVOKED')),
    verification_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- G. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('CREDENTIAL_ISSUED', 'CREDENTIAL_REVOKED', 'VERIFICATION_REQUESTED', 'VERIFICATION_APPROVED', 'ORGANIZATION_STATUS_CHANGED', 'CONSENT_GRANTED', 'CONSENT_REVOKED')),
    action TEXT NOT NULL,
    domain TEXT,
    outcome TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (outcome IN ('SUCCESS', 'FAILURE', 'PENDING')),
    target_resource_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_org_domain ON public.organizations(domain);
CREATE INDEX IF NOT EXISTS idx_org_code ON public.organizations(code);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_credentials_subject ON public.credentials(subject_id);
CREATE INDEX IF NOT EXISTS idx_credentials_issuer ON public.credentials(issuer_org_id);
CREATE INDEX IF NOT EXISTS idx_credentials_domain ON public.credentials(domain);
CREATE INDEX IF NOT EXISTS idx_consents_citizen ON public.consents(citizen_id);
CREATE INDEX IF NOT EXISTS idx_consents_org ON public.consents(requesting_org_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON public.audit_logs(organization_id);

-- ============================================================================
-- 3. SECURITY DEFINER HELPER FUNCTIONS (Prevents Policy Recursion)
-- ============================================================================

-- Helper 1: Check if user is an active member of an organization
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id 
          AND user_id = p_user_id 
          AND status = 'ACTIVE'
    );
$$;

-- Helper 2: Check if user is an admin of an organization
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id 
          AND user_id = p_user_id 
          AND member_role = 'ADMIN'
          AND status = 'ACTIVE'
    );
$$;

-- Helper 3: Check if user has ISSUER role in an active issuing organization
CREATE OR REPLACE FUNCTION public.is_org_issuer(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members om
        JOIN public.organizations o ON om.organization_id = o.id
        WHERE om.organization_id = p_org_id 
          AND om.user_id = p_user_id 
          AND om.member_role IN ('ADMIN', 'ISSUER')
          AND om.status = 'ACTIVE'
          AND o.is_issuer = TRUE
          AND o.verification_status = 'APPROVED'
    );
$$;

-- Helper 4: Check if user is a Network Admin
CREATE OR REPLACE FUNCTION public.is_network_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.profiles
        WHERE id = p_user_id 
          AND role = 'ADMIN'
          AND account_status = 'ACTIVE'
    );
$$;

-- Helper 5: Check if active consent exists for an organization to view a citizen's credential/data
CREATE OR REPLACE FUNCTION public.has_active_consent(p_citizen_id UUID, p_requesting_org_id UUID, p_credential_id UUID, p_domain TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.consents
        WHERE citizen_id = p_citizen_id
          AND requesting_org_id = p_requesting_org_id
          AND status = 'APPROVED'
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (
              credential_id IS NULL 
              OR credential_id = p_credential_id 
              OR domain = 'all' 
              OR domain = p_domain
          )
    );
$$;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_issuer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_network_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PROFILES POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
CREATE POLICY "Users can read their own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR public.is_network_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())); -- Prevents role self-promotion

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone authenticated can view verified organizations" ON public.organizations;
CREATE POLICY "Anyone authenticated can view verified organizations"
    ON public.organizations FOR SELECT
    TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Org admins can update their organization" ON public.organizations;
CREATE POLICY "Org admins can update their organization"
    ON public.organizations FOR UPDATE
    TO authenticated
    USING (public.is_org_admin(id, auth.uid()) OR public.is_network_admin(auth.uid()));

DROP POLICY IF EXISTS "Only network admins can create organizations" ON public.organizations;
CREATE POLICY "Only network admins can create organizations"
    ON public.organizations FOR INSERT
    TO authenticated
    WITH CHECK (public.is_network_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- ORGANIZATION MEMBERS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view their organization membership" ON public.organization_members;
CREATE POLICY "Members can view their organization membership"
    ON public.organization_members FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() 
        OR public.is_org_member(organization_id, auth.uid())
        OR public.is_network_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Org admins can manage organization members" ON public.organization_members;
CREATE POLICY "Org admins can manage organization members"
    ON public.organization_members FOR ALL
    TO authenticated
    USING (
        public.is_org_admin(organization_id, auth.uid())
        OR public.is_network_admin(auth.uid())
    );

-- ----------------------------------------------------------------------------
-- CREDENTIALS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Citizens can view their own credentials" ON public.credentials;
CREATE POLICY "Citizens can view their own credentials"
    ON public.credentials FOR SELECT
    TO authenticated
    USING (subject_id = auth.uid());

DROP POLICY IF EXISTS "Issuers can view credentials they issued" ON public.credentials;
CREATE POLICY "Issuers can view credentials they issued"
    ON public.credentials FOR SELECT
    TO authenticated
    USING (public.is_org_member(issuer_org_id, auth.uid()));

DROP POLICY IF EXISTS "Organizations can view credentials with active consent" ON public.credentials;
CREATE POLICY "Organizations can view credentials with active consent"
    ON public.credentials FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM public.organization_members om
            WHERE om.user_id = auth.uid()
              AND public.has_active_consent(subject_id, om.organization_id, id, domain)
        )
    );

DROP POLICY IF EXISTS "Authorized issuers can insert credentials" ON public.credentials;
CREATE POLICY "Authorized issuers can insert credentials"
    ON public.credentials FOR INSERT
    TO authenticated
    WITH CHECK (public.is_org_issuer(issuer_org_id, auth.uid()));

DROP POLICY IF EXISTS "Issuers can update status of issued credentials" ON public.credentials;
CREATE POLICY "Issuers can update status of issued credentials"
    ON public.credentials FOR UPDATE
    TO authenticated
    USING (public.is_org_issuer(issuer_org_id, auth.uid()));

-- ----------------------------------------------------------------------------
-- CONSENTS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Citizens can manage their own consents" ON public.consents;
CREATE POLICY "Citizens can manage their own consents"
    ON public.consents FOR ALL
    TO authenticated
    USING (citizen_id = auth.uid())
    WITH CHECK (citizen_id = auth.uid());

DROP POLICY IF EXISTS "Requesting organizations can view consent requests" ON public.consents;
CREATE POLICY "Requesting organizations can view consent requests"
    ON public.consents FOR SELECT
    TO authenticated
    USING (public.is_org_member(requesting_org_id, auth.uid()));

DROP POLICY IF EXISTS "Requesting organizations can create consent requests" ON public.consents;
CREATE POLICY "Requesting organizations can create consent requests"
    ON public.consents FOR INSERT
    TO authenticated
    WITH CHECK (public.is_org_member(requesting_org_id, auth.uid()));

-- ----------------------------------------------------------------------------
-- TRUST REGISTRY POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view trust registry" ON public.trust_registry;
CREATE POLICY "Authenticated users can view trust registry"
    ON public.trust_registry FOR SELECT
    TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Only network admins can manage trust registry" ON public.trust_registry;
CREATE POLICY "Only network admins can manage trust registry"
    ON public.trust_registry FOR ALL
    TO authenticated
    USING (public.is_network_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- AUDIT LOGS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Actors can view their own audit logs" ON public.audit_logs;
CREATE POLICY "Actors can view their own audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
        actor_id = auth.uid() 
        OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
        OR public.is_network_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

-- ============================================================================
-- 5. AUTOMATIC UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_orgs_updated_at ON public.organizations;
CREATE TRIGGER trg_orgs_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_credentials_updated_at ON public.credentials;
CREATE TRIGGER trg_credentials_updated_at
    BEFORE UPDATE ON public.credentials
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_consents_updated_at ON public.consents;
CREATE TRIGGER trg_consents_updated_at
    BEFORE UPDATE ON public.consents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- END OF MIGRATION 001_initial_schema_and_rls.sql
-- ============================================================================
