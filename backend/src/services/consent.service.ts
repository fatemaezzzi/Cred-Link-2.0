import { supabaseAdmin } from '../config/supabase';
import {
  RequestConsentInput,
  GrantConsentInput,
  RespondConsentInput,
  GetConsentsQuery,
  ShareCredentialInput,
} from '../validators/consent.validator';
import { AppError } from '../types';
import { AuthUser } from '../middleware/authMiddleware';

export class ConsentService {
  /**
   * Helper to format consent DB records.
   */
  private formatConsent(consent: any) {
    const citizenObj = Array.isArray(consent.citizen) ? consent.citizen[0] : consent.citizen;
    const credObj = Array.isArray(consent.credential) ? consent.credential[0] : consent.credential;
    const reqOrg = Array.isArray(consent.requesting_org) ? consent.requesting_org[0] : consent.requesting_org;

    return {
      id: consent.id,
      citizenId: consent.citizen_id,
      citizenName: citizenObj?.full_name || null,
      citizenEmail: citizenObj?.email || null,
      requestingOrgId: consent.requesting_org_id,
      requestingOrg: reqOrg
        ? { id: reqOrg.id, name: reqOrg.name, code: reqOrg.code }
        : null,
      credentialId: consent.credential_id || null,
      credential: credObj
        ? { id: credObj.id, title: credObj.title, credentialType: credObj.credential_type, status: credObj.status }
        : null,
      domain: consent.domain,
      purpose: consent.purpose,
      requestedClaims: consent.requested_claims || [],
      approvedClaims: consent.approved_claims || [],
      status: consent.status,
      grantedAt: consent.granted_at || null,
      expiresAt: consent.expires_at || null,
      createdAt: consent.created_at,
      updatedAt: consent.updated_at,
    };
  }

  /**
   * An organization member requests consent from a citizen.
   */
  async requestConsent(actor: AuthUser, input: RequestConsentInput) {
    let { citizenId, requestingOrgId, credentialId, domain, purpose, requestedClaims, expiresAt } = input;

    // Security: Derive & validate requesting organization from authenticated membership
    if (actor.role !== 'ADMIN') {
      if (!actor.organizationId) {
        throw new AppError('Forbidden. Actor has no active organization membership.', 403);
      }
      if (requestingOrgId && requestingOrgId !== actor.organizationId) {
        throw new AppError('Forbidden. Supplied requestingOrgId does not match authenticated user organization membership.', 403);
      }
      requestingOrgId = actor.organizationId;

      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('status')
        .eq('organization_id', requestingOrgId)
        .eq('user_id', actor.id)
        .maybeSingle();

      if (!member || member.status !== 'ACTIVE') {
        throw new AppError('Forbidden. You must be an active member of the requesting organization to request consent.', 403);
      }
    } else {
      const { data: org, error: orgErr } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('id', requestingOrgId)
        .maybeSingle();

      if (orgErr || !org) {
        throw new AppError('Requesting organization not found', 404);
      }
    }

    // 2. Verify target citizen profile exists
    const { data: citizenProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', citizenId)
      .maybeSingle();

    if (!citizenProfile) {
      throw new AppError('Target citizen profile not found', 404);
    }

    // 3. Verify credential if specified
    if (credentialId) {
      const { data: cred } = await supabaseAdmin
        .from('credentials')
        .select('id, subject_id')
        .eq('id', credentialId)
        .maybeSingle();

      if (!cred || cred.subject_id !== citizenId) {
        throw new AppError('Target credential not found or does not belong to the citizen', 404);
      }
    }

    // 4. Create PENDING consent record
    const { data: newConsent, error: insertError } = await supabaseAdmin
      .from('consents')
      .insert({
        citizen_id: citizenId,
        requesting_org_id: requestingOrgId,
        credential_id: credentialId || null,
        domain: domain || 'all',
        purpose,
        requested_claims: requestedClaims || [],
        approved_claims: [],
        status: 'PENDING',
        expires_at: expiresAt || null,
      })
      .select('*, requesting_org:organizations(id, name, code), citizen:profiles(id, full_name, email), credential:credentials(id, title, credential_type, status)')
      .single();

    if (insertError || !newConsent) {
      console.error('[ConsentService] Request insert error:', insertError);
      throw new AppError('Failed to create consent request', 500);
    }

    // 5. Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: requestingOrgId,
        event_type: 'VERIFICATION_REQUESTED',
        action: `Requested consent from citizen ${citizenId} for purpose: ${purpose}`,
        domain,
        outcome: 'SUCCESS',
        target_resource_id: newConsent.id,
        metadata: { citizenId, purpose, status: 'PENDING' },
      });
    } catch (auditErr) {
      console.error('[ConsentService] Audit log warning:', auditErr);
    }

    return this.formatConsent(newConsent);
  }

  /**
   * Citizen directly grants consent to an organization.
   */
  async grantConsent(actor: AuthUser, input: GrantConsentInput) {
    const { requestingOrgId, credentialId, domain, purpose, approvedClaims, expiresAt } = input;

    // Verify requesting org exists
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', requestingOrgId)
      .maybeSingle();

    if (!org) {
      throw new AppError('Requesting organization not found', 404);
    }

    // If credentialId specified, verify ownership
    if (credentialId) {
      const { data: cred } = await supabaseAdmin
        .from('credentials')
        .select('id, subject_id')
        .eq('id', credentialId)
        .maybeSingle();

      if (!cred || cred.subject_id !== actor.id) {
        throw new AppError('Credential not found or does not belong to you', 404);
      }
    }

    const grantedAt = new Date().toISOString();

    const { data: newConsent, error: insertError } = await supabaseAdmin
      .from('consents')
      .insert({
        citizen_id: actor.id,
        requesting_org_id: requestingOrgId,
        credential_id: credentialId || null,
        domain: domain || 'all',
        purpose,
        requested_claims: approvedClaims || [],
        approved_claims: approvedClaims || [],
        status: 'APPROVED',
        granted_at: grantedAt,
        expires_at: expiresAt || null,
      })
      .select('*, requesting_org:organizations(id, name, code)')
      .single();

    if (insertError || !newConsent) {
      console.error('[ConsentService] Grant insert error:', insertError);
      throw new AppError('Failed to grant consent', 500);
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: requestingOrgId,
        event_type: 'CONSENT_GRANTED',
        action: `Granted consent to organization ${org.name} for purpose: ${purpose}`,
        domain,
        outcome: 'SUCCESS',
        target_resource_id: newConsent.id,
        metadata: { requestingOrgId, approvedClaims, grantedAt },
      });
    } catch (auditErr) {
      console.error('[ConsentService] Audit log warning:', auditErr);
    }

    return this.formatConsent(newConsent);
  }

  /**
   * Citizen approves or denies a PENDING consent request.
   */
  async respondConsent(actor: AuthUser, consentId: string, input: RespondConsentInput) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(consentId)) {
      throw new AppError('Invalid consent ID format', 400);
    }

    const { data: consent, error } = await supabaseAdmin
      .from('consents')
      .select('*')
      .eq('id', consentId)
      .maybeSingle();

    if (error || !consent) {
      throw new AppError('Consent request not found', 404);
    }

    // Only citizen owner can respond
    if (consent.citizen_id !== actor.id && actor.role !== 'ADMIN') {
      throw new AppError('Forbidden. Only the citizen subject can respond to this consent request.', 403);
    }

    if (consent.status !== 'PENDING') {
      throw new AppError(`Consent request is already ${consent.status.toLowerCase()}`, 400);
    }

    const newStatus = input.action === 'APPROVE' ? 'APPROVED' : 'DENIED';
    const grantedAt = input.action === 'APPROVE' ? new Date().toISOString() : null;
    const finalApprovedClaims = input.action === 'APPROVE'
      ? (input.approvedClaims && input.approvedClaims.length > 0 ? input.approvedClaims : consent.requested_claims)
      : [];

    const { data: updatedConsent, error: updateError } = await supabaseAdmin
      .from('consents')
      .update({
        status: newStatus,
        granted_at: grantedAt,
        approved_claims: finalApprovedClaims,
        expires_at: input.expiresAt || consent.expires_at,
      })
      .eq('id', consentId)
      .select('*, requesting_org:organizations(id, name, code), citizen:profiles(id, full_name, email), credential:credentials(id, title, credential_type, status)')
      .single();

    if (updateError || !updatedConsent) {
      console.error('[ConsentService] Respond update error:', updateError);
      throw new AppError('Failed to respond to consent request', 500);
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: consent.requesting_org_id,
        event_type: input.action === 'APPROVE' ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
        action: `${input.action === 'APPROVE' ? 'Approved' : 'Denied'} consent request ${consentId}`,
        domain: consent.domain,
        outcome: 'SUCCESS',
        target_resource_id: consentId,
        metadata: { action: input.action, approvedClaims: finalApprovedClaims },
      });
    } catch (auditErr) {
      console.error('[ConsentService] Audit log warning:', auditErr);
    }

    return this.formatConsent(updatedConsent);
  }

  /**
   * Citizen revokes a previously granted/approved consent.
   */
  async revokeConsent(actor: AuthUser, consentId: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(consentId)) {
      throw new AppError('Invalid consent ID format', 400);
    }

    const { data: consent, error } = await supabaseAdmin
      .from('consents')
      .select('*')
      .eq('id', consentId)
      .maybeSingle();

    if (error || !consent) {
      throw new AppError('Consent record not found', 404);
    }

    // Only citizen subject can revoke consent
    if (consent.citizen_id !== actor.id && actor.role !== 'ADMIN') {
      throw new AppError('Forbidden. Only the citizen subject can revoke this consent.', 403);
    }

    if (consent.status === 'REVOKED') {
      throw new AppError('Consent is already revoked', 400);
    }

    const { data: updatedConsent, error: updateError } = await supabaseAdmin
      .from('consents')
      .update({
        status: 'REVOKED',
      })
      .eq('id', consentId)
      .select('*, requesting_org:organizations(id, name, code)')
      .single();

    if (updateError || !updatedConsent) {
      console.error('[ConsentService] Revoke error:', updateError);
      throw new AppError('Failed to revoke consent', 500);
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: consent.requesting_org_id,
        event_type: 'CONSENT_REVOKED',
        action: `Revoked consent ${consentId} for organization ${consent.requesting_org_id}`,
        domain: consent.domain,
        outcome: 'SUCCESS',
        target_resource_id: consentId,
        metadata: { status: 'REVOKED' },
      });
    } catch (auditErr) {
      console.error('[ConsentService] Audit log warning:', auditErr);
    }

    return this.formatConsent(updatedConsent);
  }

  /**
   * Lists consents with access control & auto-expiry check.
   */
  async listConsents(actor: AuthUser, query: GetConsentsQuery) {
    const { page, limit, status, domain, citizenId, requestingOrgId } = query;
    const offset = (page - 1) * limit;

    // Fetch memberships of actor
    const { data: memberships } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', actor.id)
      .eq('status', 'ACTIVE');

    const userOrgIds = (memberships || []).map((m) => m.organization_id);

    let queryBuilder = supabaseAdmin
      .from('consents')
      .select('*, requesting_org:organizations(id, name, code), citizen:profiles(id, full_name, email), credential:credentials(id, title, credential_type, status)', { count: 'exact' });

    // Authorization scoping
    if (actor.role !== 'ADMIN') {
      if (userOrgIds.length > 0) {
        queryBuilder = queryBuilder.or(`citizen_id.eq.${actor.id},requesting_org_id.in.(${userOrgIds.join(',')})`);
      } else {
        queryBuilder = queryBuilder.eq('citizen_id', actor.id);
      }
    }

    if (citizenId && (actor.role === 'ADMIN' || citizenId === actor.id)) {
      queryBuilder = queryBuilder.eq('citizen_id', citizenId);
    }
    if (requestingOrgId) {
      queryBuilder = queryBuilder.eq('requesting_org_id', requestingOrgId);
    }
    if (status) {
      queryBuilder = queryBuilder.eq('status', status);
    }
    if (domain) {
      queryBuilder = queryBuilder.eq('domain', domain);
    }

    const { data: consents, count, error } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[ConsentService] List error:', error);
      throw new AppError('Failed to fetch consents', 500);
    }

    const now = new Date();
    const formattedConsents = (consents || []).map((consent) => {
      // Auto expire check
      if (consent.status === 'APPROVED' && consent.expires_at && new Date(consent.expires_at) < now) {
        consent.status = 'EXPIRED';
        // Async update DB
        supabaseAdmin.from('consents').update({ status: 'EXPIRED' }).eq('id', consent.id);
      }
      return this.formatConsent(consent);
    });

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      consents: formattedConsents,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves single consent details by ID.
   */
  async getConsentById(actor: AuthUser, id: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new AppError('Invalid consent ID format', 400);
    }

    const { data: consent, error } = await supabaseAdmin
      .from('consents')
      .select('*, requesting_org:organizations(id, name, code)')
      .eq('id', id)
      .maybeSingle();

    if (error || !consent) {
      throw new AppError('Consent record not found', 404);
    }

    // Access control check
    if (actor.role !== 'ADMIN' && consent.citizen_id !== actor.id) {
      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('status')
        .eq('organization_id', consent.requesting_org_id)
        .eq('user_id', actor.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (!member) {
        throw new AppError('Forbidden. You are not authorized to view this consent record.', 403);
      }
    }

    return this.formatConsent(consent);
  }

  /**
   * Consent-Enforced Credential Sharing (Selective Disclosure).
   * Validates active approved consent and returns filtered claims approved by citizen.
   */
  async accessSharedCredential(actor: AuthUser, input: ShareCredentialInput) {
    const { credentialId, requestingOrgId } = input;

    // 1. Verify actor belongs to requesting organization
    if (actor.role !== 'ADMIN') {
      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('status')
        .eq('organization_id', requestingOrgId)
        .eq('user_id', actor.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (!member) {
        throw new AppError('Forbidden. You must be an active member of the requesting organization.', 403);
      }
    }

    // 2. Fetch target credential
    const { data: cred, error: credError } = await supabaseAdmin
      .from('credentials')
      .select('*, issuer:organizations(id, name, code, did)')
      .eq('id', credentialId)
      .maybeSingle();

    if (credError || !cred) {
      throw new AppError('Credential not found', 404);
    }

    // 3. Evaluate active approved consent for (citizen_id, requesting_org_id)
    const { data: activeConsents, error: consentError } = await supabaseAdmin
      .from('consents')
      .select('*')
      .eq('citizen_id', cred.subject_id)
      .eq('requesting_org_id', requestingOrgId)
      .eq('status', 'APPROVED');

    if (consentError || !activeConsents || activeConsents.length === 0) {
      throw new AppError('Forbidden. No active approved consent found to access this credential.', 403);
    }

    // Find applicable consent matching specific credential_id, domain, or 'all'
    const validConsent = activeConsents.find((c) => {
      const notExpired = !c.expires_at || new Date(c.expires_at) > new Date();
      const matchesCred = !c.credential_id || c.credential_id === credentialId;
      const matchesDomain = !c.domain || c.domain === 'all' || c.domain === cred.domain;
      return notExpired && matchesCred && matchesDomain;
    });

    if (!validConsent) {
      throw new AppError('Forbidden. Approved consent has expired or does not cover this credential domain.', 403);
    }

    // 4. Selective Disclosure: Filter claims based on approved_claims
    const rawClaims = cred.claims || {};
    let sharedClaims: any = {};

    if (Array.isArray(validConsent.approved_claims) && validConsent.approved_claims.length > 0) {
      for (const key of validConsent.approved_claims) {
        if (key in rawClaims) {
          sharedClaims[key] = rawClaims[key];
        }
      }
      // If approved_claims had keys that didn't match directly (e.g. ['all'] or empty match fallback)
      if (Object.keys(sharedClaims).length === 0) {
        sharedClaims = rawClaims;
      }
    } else {
      sharedClaims = rawClaims;
    }

    // 5. Audit log access
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: requestingOrgId,
        event_type: 'VERIFICATION_REQUESTED',
        action: `Accessed shared credential ${credentialId} under consent ${validConsent.id}`,
        domain: cred.domain,
        outcome: 'SUCCESS',
        target_resource_id: credentialId,
        metadata: { consentId: validConsent.id, sharedClaimsCount: Object.keys(sharedClaims).length },
      });
    } catch (auditErr) {
      console.error('[ConsentService] Audit log warning:', auditErr);
    }

    const issuerObj = Array.isArray(cred.issuer) ? cred.issuer[0] : cred.issuer;

    return {
      credentialId: cred.id,
      subjectId: cred.subject_id,
      issuer: issuerObj ? { id: issuerObj.id, name: issuerObj.name, did: issuerObj.did } : null,
      domain: cred.domain,
      credentialType: cred.credential_type,
      title: cred.title,
      status: cred.status,
      sharedClaims,
      consentId: validConsent.id,
      purpose: validConsent.purpose,
      accessedAt: new Date().toISOString(),
    };
  }
}

export const consentService = new ConsentService();
