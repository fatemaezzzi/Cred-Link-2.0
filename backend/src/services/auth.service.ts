import { supabaseClient, supabaseAdmin } from '../config/supabase';
import { RegisterInput, LoginInput } from '../validators/auth.validator';
import { AppError } from '../types';

export class AuthService {
  /**
   * Registers a new user account with Supabase Auth (auto-confirmed) and creates their profile.
   * Enforces least-privilege security: Public registration cannot self-assign 'ADMIN'.
   */
  async registerUser(input: RegisterInput) {
    const { email, password, fullName, phone, role } = input;
    // Security Patch: Public registration cannot grant ADMIN privilege
    const safeRole = role && role !== 'ADMIN' ? role : 'CITIZEN';

    // 1. Create user account via Supabase Admin API with email auto-confirmed
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: safeRole,
      },
    });

    if (authError || !authData.user) {
      throw new AppError(authError?.message || 'Failed to create user account', 400);
    }

    const userId = authData.user.id;

    // 2. Create or update matching profile entry in public.profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          full_name: fullName,
          email,
          phone: phone || null,
          role: safeRole,
          account_status: 'ACTIVE',
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single();

    if (profileError) {
      console.error('[AuthService] Profile creation warning:', profileError);
    }

    // 3. Immediately log in user to return access token session
    const { data: sessionData } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    return {
      user: profile || {
        id: userId,
        email,
        full_name: fullName,
        role: safeRole,
      },
      session: sessionData?.session
        ? {
            access_token: sessionData.session.access_token,
            refresh_token: sessionData.session.refresh_token,
            expires_at: sessionData.session.expires_at,
          }
        : null,
    };
  }

  /**
   * Authenticates user credentials via Supabase Auth and returns profile & session.
   * Auto-provisions missing profile entries for users created directly via Supabase Auth Dashboard.
   * Enforces least-privilege: Auto-provisioned profiles are assigned default 'CITIZEN' role.
   */
  async loginUser(input: LoginInput) {
    const { email, password } = input;

    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user || !authData.session) {
      throw new AppError(authError?.message || 'Invalid email or password credentials', 401);
    }

    const userId = authData.user.id;

    // Fetch user profile from DB
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      throw new AppError('User profile not found. Please contact network administrator.', 403);
    }

    if (profile.account_status === 'SUSPENDED') {
      throw new AppError('Your account has been suspended. Please contact administrator.', 403);
    }

    // Fetch organization memberships
    const { data: memberships } = await supabaseAdmin
      .from('organization_members')
      .select('id, organization_id, member_role, status, organization:organizations(id, name, code, domain, did, is_issuer, verification_status, authorized_credential_types)')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    const activeMembership = memberships && memberships.length > 0 ? memberships[0] : null;
    const rawOrg = activeMembership?.organization;
    const primaryOrg = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;

    // organizationId MUST be the actual UUID from organizations.id / organization_members.organization_id
    const organizationId = activeMembership ? (primaryOrg?.id || activeMembership.organization_id) : null;
    const organizationName = primaryOrg?.name || (profile.role === 'ADMIN' ? 'CredLink Network Governance' : 'Unaffiliated Citizen');
    const organizationCode = primaryOrg?.code || (profile.role === 'ADMIN' ? 'GOV-ROOT' : null);
    const organizationDomain = primaryOrg?.domain || (profile.role === 'ADMIN' ? 'admin' : null);
    const organizationDid = primaryOrg?.did || (profile.role === 'ADMIN' ? 'did:credlink:governance:root' : (profile.id ? `did:credlink:citizen:${profile.id}` : 'did:credlink:citizen:unaffiliated'));
    const organizationStatus = primaryOrg ? ((primaryOrg as any).verification_status || (primaryOrg as any).status || 'APPROVED') : (profile.role === 'ADMIN' ? 'APPROVED' : null);
    const isIssuer = primaryOrg ? (primaryOrg.is_issuer ?? false) : false;
    const authorizedCredentialTypes = primaryOrg ? ((primaryOrg as any).authorized_credential_types || (primaryOrg as any).authorizedCredentialTypes || []) : [];

    return {
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        phone: profile.phone,
        role: profile.role,
        status: profile.account_status,
        organizationId,
        organizationName,
        organizationCode,
        organizationDomain,
        organizationDid,
        organizationStatus,
        isIssuer,
        authorizedCredentialTypes,
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
      },
      memberships: memberships || [],
    };
  }

  /**
   * Logs out the user session.
   */
  async logoutUser(token: string) {
    if (token) {
      await supabaseAdmin.auth.admin.signOut(token);
    }
    return { success: true };
  }

  /**
   * Retrieves profile details and memberships for the authenticated user.
   */
  async getCurrentUser(userId: string) {
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      throw new AppError('User profile not found. Please contact network administrator.', 404);
    }

    const { data: memberships } = await supabaseAdmin
      .from('organization_members')
      .select('id, organization_id, member_role, status, organization:organizations(id, name, code, domain, did, is_issuer, verification_status, authorized_credential_types)')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    const activeMembership = memberships && memberships.length > 0 ? memberships[0] : null;
    const rawOrg = activeMembership?.organization;
    const primaryOrg = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;

    const organizationId = activeMembership ? (primaryOrg?.id || activeMembership.organization_id) : null;
    const organizationName = primaryOrg?.name || (profile.role === 'ADMIN' ? 'CredLink Network Governance' : 'Unaffiliated Citizen');
    const organizationCode = primaryOrg?.code || (profile.role === 'ADMIN' ? 'GOV-ROOT' : null);
    const organizationDomain = primaryOrg?.domain || (profile.role === 'ADMIN' ? 'admin' : null);
    const organizationDid = primaryOrg?.did || (profile.role === 'ADMIN' ? 'did:credlink:governance:root' : (profile.id ? `did:credlink:citizen:${profile.id}` : 'did:credlink:citizen:unaffiliated'));
    const organizationStatus = primaryOrg ? ((primaryOrg as any).verification_status || (primaryOrg as any).status || 'APPROVED') : (profile.role === 'ADMIN' ? 'APPROVED' : null);
    const isIssuer = primaryOrg ? (primaryOrg.is_issuer ?? false) : false;
    const authorizedCredentialTypes = primaryOrg ? ((primaryOrg as any).authorized_credential_types || (primaryOrg as any).authorizedCredentialTypes || []) : [];

    return {
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        phone: profile.phone,
        role: profile.role,
        status: profile.account_status,
        organizationId,
        organizationName,
        organizationCode,
        organizationDomain,
        organizationDid,
        organizationStatus,
        isIssuer,
        authorizedCredentialTypes,
        createdAt: profile.created_at,
      },
      memberships: memberships || [],
    };
  }
}

export const authService = new AuthService();
