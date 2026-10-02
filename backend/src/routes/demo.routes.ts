import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

/**
 * GET /api/demo/dashboard
 * Public read-only endpoint that returns aggregated dashboard data from Supabase
 * for the demo portal. No authentication required.
 */
router.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [credRes, orgRes, trustRes, auditRes, consentRes] = await Promise.allSettled([
      supabaseAdmin
        .from('credentials')
        .select('*, issuer:organizations!credentials_issuer_org_id_fkey(id, name, did, domain)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('trust_registry')
        .select('*, organization:organizations!trust_registry_organization_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabaseAdmin
        .from('consent_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const credentials = credRes.status === 'fulfilled' && !credRes.value.error
      ? credRes.value.data || []
      : [];

    const organizations = orgRes.status === 'fulfilled' && !orgRes.value.error
      ? orgRes.value.data || []
      : [];

    const trustEntries = trustRes.status === 'fulfilled' && !trustRes.value.error
      ? trustRes.value.data || []
      : [];

    const auditLogs = auditRes.status === 'fulfilled' && !auditRes.value.error
      ? auditRes.value.data || []
      : [];

    const consents = consentRes.status === 'fulfilled' && !consentRes.value.error
      ? consentRes.value.data || []
      : [];

    // Map credentials to frontend-expected shape
    const mappedCredentials = credentials.map((c: any) => ({
      id: c.id,
      subjectId: c.subject_id,
      subjectName: c.claims?.subjectName || `Citizen ${(c.subject_id || '').substring(0, 6)}`,
      issuerOrgId: c.issuer_org_id,
      issuer: c.issuer ? { id: c.issuer.id, name: c.issuer.name, did: c.issuer.did } : null,
      domain: c.domain,
      credentialType: c.credential_type,
      title: c.title,
      claims: c.claims,
      issuanceDate: c.issuance_date,
      expirationDate: c.expiration_date,
      status: c.status,
      issuerSignature: c.issuer_signature,
      qrPayload: c.qr_payload,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    // Map organizations
    const mappedOrganizations = organizations.map((o: any) => ({
      id: o.id,
      name: o.name,
      code: o.code,
      domain: o.domain,
      did: o.did,
      is_issuer: o.is_issuer,
      isIssuer: o.is_issuer,
      verification_status: o.verification_status,
      status: o.verification_status,
      authorized_credential_types: o.authorized_credential_types,
      authorizedCredentialTypes: o.authorized_credential_types,
      createdAt: o.created_at,
    }));

    // Map trust entries
    const mappedTrustEntries = trustEntries.map((t: any) => ({
      id: t.id,
      organizationId: t.organization_id,
      issuerIdentifier: t.issuer_identifier,
      organization: t.organization ? {
        id: t.organization.id,
        name: t.organization.name,
        code: t.organization.code,
        domain: t.organization.domain,
        did: t.organization.did,
        is_issuer: t.organization.is_issuer,
        isIssuer: t.organization.is_issuer,
        verification_status: t.organization.verification_status,
        status: t.organization.verification_status,
        authorized_credential_types: t.organization.authorized_credential_types,
        authorizedCredentialTypes: t.organization.authorized_credential_types,
        createdAt: t.organization.created_at,
      } : null,
      trustStatus: t.trust_status,
      verificationMetadata: t.verification_metadata,
      lastVerifiedAt: t.last_verified_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    // Map audit logs
    const mappedAuditLogs = auditLogs.map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      userName: a.user_name || 'System',
      eventType: a.event_type,
      targetResourceType: a.target_resource_type,
      targetResourceId: a.target_resource_id,
      domain: a.domain,
      metadata: a.metadata,
      ipAddress: a.ip_address,
      createdAt: a.created_at,
    }));

    // Map consents
    const mappedConsents = consents.map((con: any) => ({
      id: con.id,
      citizenId: con.citizen_id,
      requestingOrgId: con.requesting_org_id,
      domain: con.domain,
      purpose: con.purpose,
      requestedClaims: con.requested_claims,
      approvedClaims: con.approved_claims,
      status: con.status,
      expiresAt: con.expires_at,
      createdAt: con.created_at,
    }));

    res.json({
      success: true,
      data: {
        credentials: mappedCredentials,
        organizations: mappedOrganizations,
        trustEntries: mappedTrustEntries,
        auditLogs: mappedAuditLogs,
        consents: mappedConsents,
        stats: {
          totalCredentials: mappedCredentials.length,
          validCredentials: mappedCredentials.filter((c: any) => c.status === 'VALID').length,
          revokedCredentials: mappedCredentials.filter((c: any) => c.status === 'REVOKED').length,
          totalOrganizations: mappedOrganizations.length,
          trustedIssuers: mappedTrustEntries.filter((t: any) => t.trustStatus === 'VERIFIED').length,
          totalAuditLogs: mappedAuditLogs.length,
          pendingConsents: mappedConsents.filter((c: any) => c.status === 'PENDING').length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
