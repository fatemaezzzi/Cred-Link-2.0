import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import {
  RegisterTrustIssuerInput,
  UpdateTrustStatusInput,
  GetTrustRegistryQuery,
  ComprehensiveVerifyInput,
} from '../validators/trust.validator';
import { AppError } from '../types';
import { AuthUser } from '../middleware/authMiddleware';

export class TrustService {
  /**
   * Sorts object keys recursively to ensure deterministic HMAC-SHA256 signature verification.
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }
    return Object.keys(obj)
      .sort()
      .reduce((acc: any, key: string) => {
        acc[key] = this.sortObjectKeys(obj[key]);
        return acc;
      }, {});
  }

  /**
   * Computes HMAC-SHA256 signature over canonical credential payload.
   */
  private generateCredentialSignature(
    issuerDid: string,
    subjectId: string,
    domain: string,
    credentialType: string,
    issuanceDate: string,
    claims: any
  ): string {
    const normalizedIssuanceDate = new Date(issuanceDate).toISOString();
    const sortedClaims = this.sortObjectKeys(claims);
    const canonicalPayload = `${issuerDid}:${subjectId}:${domain}:${credentialType}:${normalizedIssuanceDate}:${JSON.stringify(sortedClaims)}`;
    const secret = process.env.JWT_SECRET || env.SUPABASE_SECRET_KEY || 'credlink-credential-signing-key-2026';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(canonicalPayload);
    return `sha256:${hmac.digest('hex')}`;
  }

  /**
   * Helper to format trust registry entry.
   */
  private formatTrustEntry(entry: any) {
    const orgObj = Array.isArray(entry.organization) ? entry.organization[0] : entry.organization;
    return {
      id: entry.id,
      organizationId: entry.organization_id,
      issuerIdentifier: entry.issuer_identifier,
      organization: orgObj
        ? {
            id: orgObj.id,
            name: orgObj.name,
            code: orgObj.code,
            domain: orgObj.domain,
            did: orgObj.did,
            isIssuer: orgObj.is_issuer,
            verificationStatus: orgObj.verification_status,
          }
        : null,
      trustStatus: entry.trust_status,
      verificationMetadata: entry.verification_metadata || {},
      lastVerifiedAt: entry.last_verified_at,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    };
  }

  /**
   * Network Admin registers or updates an approved issuer in the Trust Registry.
   */
  async registerIssuer(actor: AuthUser, input: RegisterTrustIssuerInput) {
    if (actor.role !== 'ADMIN') {
      throw new AppError('Forbidden. Only Network Administrators can modify the Trust Registry.', 403);
    }

    const { organizationId, trustStatus, verificationMetadata } = input;

    // Fetch organization
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();

    if (orgError || !org) {
      throw new AppError('Organization not found', 404);
    }

    if (org.verification_status !== 'APPROVED') {
      throw new AppError('Organization must be APPROVED before being registered in the Trust Registry', 400);
    }

    const now = new Date().toISOString();
    const metadata = {
      registeredBy: actor.id,
      registeredAt: now,
      ...(verificationMetadata || {}),
    };

    // Upsert into trust_registry
    const { data: trustEntry, error: upsertError } = await supabaseAdmin
      .from('trust_registry')
      .upsert(
        {
          organization_id: organizationId,
          issuer_identifier: org.did,
          trust_status: trustStatus || 'VERIFIED',
          verification_metadata: metadata,
          last_verified_at: now,
        },
        { onConflict: 'organization_id' }
      )
      .select('*, organization:organizations(id, name, code, domain, did, is_issuer, verification_status)')
      .single();

    if (upsertError || !trustEntry) {
      console.error('[TrustService] Upsert error:', upsertError);
      throw new AppError('Failed to update Trust Registry entry', 500);
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: organizationId,
        event_type: 'ORGANIZATION_STATUS_CHANGED',
        action: `Registered issuer ${org.name} (${org.did}) in Trust Registry with status ${trustStatus}`,
        domain: org.domain,
        outcome: 'SUCCESS',
        target_resource_id: trustEntry.id,
        metadata: { trustStatus, issuerIdentifier: org.did },
      });
    } catch (auditErr) {
      console.error('[TrustService] Audit log warning:', auditErr);
    }

    return this.formatTrustEntry(trustEntry);
  }

  /**
   * Updates trust status of an issuer (VERIFIED, SUSPENDED, REVOKED).
   */
  async updateTrustStatus(actor: AuthUser, id: string, input: UpdateTrustStatusInput) {
    if (actor.role !== 'ADMIN') {
      throw new AppError('Forbidden. Only Network Administrators can modify Trust Registry status.', 403);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let queryBuilder = supabaseAdmin
      .from('trust_registry')
      .select('*, organization:organizations(id, name, code, domain, did, is_issuer, verification_status)');

    if (uuidRegex.test(id)) {
      queryBuilder = queryBuilder.or(`id.eq.${id},organization_id.eq.${id}`);
    } else {
      queryBuilder = queryBuilder.eq('issuer_identifier', id);
    }

    const { data: trustEntry, error } = await queryBuilder.maybeSingle();

    if (error || !trustEntry) {
      throw new AppError('Trust Registry record not found', 404);
    }

    const now = new Date().toISOString();
    const updatedMetadata = {
      ...(trustEntry.verification_metadata || {}),
      statusReason: input.reason || null,
      updatedBy: actor.id,
      updatedAt: now,
      ...(input.metadata || {}),
    };

    const { data: updatedEntry, error: updateError } = await supabaseAdmin
      .from('trust_registry')
      .update({
        trust_status: input.trustStatus,
        verification_metadata: updatedMetadata,
        last_verified_at: now,
      })
      .eq('id', trustEntry.id)
      .select('*, organization:organizations(id, name, code, domain, did, is_issuer, verification_status)')
      .single();

    if (updateError || !updatedEntry) {
      console.error('[TrustService] Update error:', updateError);
      throw new AppError('Failed to update Trust Registry status', 500);
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: updatedEntry.organization_id,
        event_type: 'ORGANIZATION_STATUS_CHANGED',
        action: `Changed Trust Registry status for ${updatedEntry.issuer_identifier} to ${input.trustStatus}`,
        outcome: 'SUCCESS',
        target_resource_id: updatedEntry.id,
        metadata: { trustStatus: input.trustStatus, reason: input.reason },
      });
    } catch (auditErr) {
      console.error('[TrustService] Audit log warning:', auditErr);
    }

    return this.formatTrustEntry(updatedEntry);
  }

  /**
   * Retrieves paginated list of Trust Registry entries.
   */
  async listTrustRegistry(query: GetTrustRegistryQuery) {
    const { page, limit, trustStatus, domain } = query;
    const offset = (page - 1) * limit;

    let queryBuilder = supabaseAdmin
      .from('trust_registry')
      .select('*, organization:organizations(id, name, code, domain, did, is_issuer, verification_status)', {
        count: 'exact',
      });

    if (trustStatus) {
      queryBuilder = queryBuilder.eq('trust_status', trustStatus);
    }

    const { data: entries, count, error } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[TrustService] List error:', error);
      throw new AppError('Failed to fetch Trust Registry entries', 500);
    }

    let formatted = (entries || []).map((e) => this.formatTrustEntry(e));

    if (domain) {
      formatted = formatted.filter((item) => item.organization?.domain === domain);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      entries: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves single Trust Registry record by organization ID or DID.
   */
  async getTrustByOrgId(orgIdOrDid: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let queryBuilder = supabaseAdmin
      .from('trust_registry')
      .select('*, organization:organizations(id, name, code, domain, did, is_issuer, verification_status)');

    if (uuidRegex.test(orgIdOrDid)) {
      queryBuilder = queryBuilder.or(`id.eq.${orgIdOrDid},organization_id.eq.${orgIdOrDid}`);
    } else {
      queryBuilder = queryBuilder.eq('issuer_identifier', orgIdOrDid);
    }

    const { data: entry, error } = await queryBuilder.maybeSingle();

    if (error || !entry) {
      throw new AppError('Issuer organization not found in Trust Registry', 404);
    }

    return this.formatTrustEntry(entry);
  }

  /**
   * Comprehensive Multi-Layer Credential Verification.
   * Evaluates Credential Existence, Issuer Trust Registry Status, Application Lifecycle, Expiration, and HMAC Signature.
   */
  async verifyCredentialComprehensive(actor: AuthUser, input: ComprehensiveVerifyInput) {
    let credData: any = null;

    if (input.credentialId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.credentialId)) {
        throw new AppError('Invalid credential ID format', 400);
      }

      const { data: cred, error } = await supabaseAdmin
        .from('credentials')
        .select('*, issuer:organizations(id, name, code, domain, did, is_issuer, verification_status)')
        .eq('id', input.credentialId)
        .maybeSingle();

      if (error || !cred) {
        throw new AppError('Credential record not found for verification', 404);
      }
      credData = cred;
    } else if (input.credentialPayload) {
      credData = input.credentialPayload;
    } else {
      throw new AppError('Either credentialId or credentialPayload must be provided for verification', 400);
    }

    // 1. Resolve Issuer Org & Trust Registry Record
    const issuerOrgId = credData.issuer_org_id || credData.issuerOrgId;
    let trustEntry: any = null;
    let issuerOrg: any = null;

    if (issuerOrgId) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('*')
        .eq('id', issuerOrgId)
        .maybeSingle();
      issuerOrg = org;

      const { data: trust } = await supabaseAdmin
        .from('trust_registry')
        .select('*')
        .eq('organization_id', issuerOrgId)
        .maybeSingle();
      trustEntry = trust;
    }

    const issuerApproved = issuerOrg?.verification_status === 'APPROVED' && issuerOrg?.is_issuer === true;
    const issuerTrustStatus = trustEntry?.trust_status || (issuerApproved ? 'VERIFIED' : 'UNREGISTERED');
    const isIssuerTrusted = issuerTrustStatus === 'VERIFIED';

    // 2. Lifecycle Status & Expiration
    const isRevoked = credData.status === 'REVOKED';
    const isExpired = credData.expiration_date ? new Date(credData.expiration_date) < new Date() : false;
    const isLifecycleValid = credData.status === 'VALID' && !isRevoked && !isExpired;

    // 3. Cryptographic HMAC Signature Verification
    const issuerDid = issuerOrg?.did || credData.issuer?.did || `did:credlink:org:unknown`;
    const expectedSignature = this.generateCredentialSignature(
      issuerDid,
      credData.subject_id || credData.subjectId,
      credData.domain,
      credData.credential_type || credData.credentialType,
      credData.issuance_date || credData.issuanceDate,
      credData.claims
    );

    const signatureValid =
      credData.issuer_signature === expectedSignature || credData.issuerSignature === expectedSignature;

    // 4. Overall Comprehensive Validity Determination
    const overallValid = isIssuerTrusted && issuerApproved && isLifecycleValid && signatureValid;

    // 5. Audit log verification attempt
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: issuerOrgId || null,
        event_type: overallValid ? 'VERIFICATION_APPROVED' : 'VERIFICATION_REQUESTED',
        action: `Verified credential ${credData.id || 'payload'} - Outcome: ${overallValid ? 'APPROVED' : 'REJECTED'}`,
        domain: credData.domain,
        outcome: overallValid ? 'SUCCESS' : 'FAILURE',
        target_resource_id: credData.id || null,
        metadata: {
          overallValid,
          issuerTrustStatus,
          isLifecycleValid,
          signatureValid,
        },
      });
    } catch (auditErr) {
      console.error('[TrustService] Audit log warning:', auditErr);
    }

    return {
      verified: overallValid,
      verificationResult: overallValid ? 'APPROVED' : 'REJECTED',
      credentialSummary: {
        id: credData.id,
        subjectId: credData.subject_id || credData.subjectId,
        domain: credData.domain,
        credentialType: credData.credential_type || credData.credentialType,
        title: credData.title,
        status: credData.status,
      },
      trustRegistryCheck: {
        issuerDid,
        issuerName: issuerOrg?.name || 'Unknown Issuer',
        issuerOrgApproved: issuerApproved,
        trustStatus: issuerTrustStatus,
        isTrusted: isIssuerTrusted,
        lastVerifiedAt: trustEntry?.last_verified_at || issuerOrg?.updated_at || null,
      },
      lifecycleCheck: {
        status: credData.status,
        isRevoked,
        isExpired,
        expirationDate: credData.expiration_date || null,
      },
      cryptographicCheck: {
        signatureValid,
        algorithm: 'HMAC-SHA256',
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}

export const trustService = new TrustService();
