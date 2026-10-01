import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import {
  CreateCredentialInput,
  GetCredentialsQuery,
  RevokeCredentialInput,
  VerifyCredentialInput,
} from '../validators/credential.validator';
import { AppError } from '../types';
import { AuthUser } from '../middleware/authMiddleware';

export class CredentialService {
  /**
   * Recursively sorts object keys lexicographically to guarantee identical JSON representation
   * regardless of Postgres JSONB column key reordering.
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
   * Generates a deterministic HMAC-SHA256 signature for a credential payload.
   * Normalizes issuanceDate to standard ISO string and sorts claim keys to guarantee consistency.
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
   * Helper to retrieve revocation details from audit_logs for a revoked credential.
   */
  private async getRevocationMetadata(credentialId: string) {
    const { data: log } = await supabaseAdmin
      .from('audit_logs')
      .select('metadata, created_at')
      .eq('target_resource_id', credentialId)
      .eq('event_type', 'CREDENTIAL_REVOKED')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (log) {
      return {
        reason: log.metadata?.reason || 'Revoked by authorized issuer',
        revokedAt: log.metadata?.revokedAt || log.created_at,
      };
    }
    return { reason: null, revokedAt: null };
  }

  /**
   * Issues a new verifiable credential.
   * Enforces issuer organization authorization, active member role, and audit logging.
   */
  async createCredential(actor: AuthUser, input: CreateCredentialInput) {
    let { subjectId, issuerOrgId, domain, credentialType, title, claims, expirationDate } = input;

    // Security: Derive & validate issuer organization from authenticated membership
    if (actor.role !== 'ADMIN') {
      if (!actor.organizationId) {
        throw new AppError('Forbidden. Actor has no active organization membership.', 403);
      }
      if (issuerOrgId && issuerOrgId !== actor.organizationId) {
        throw new AppError('Forbidden. Supplied issuerOrgId does not match authenticated user organization membership.', 403);
      }
      issuerOrgId = actor.organizationId;
    }

    // 1. Verify subject citizen profile exists
    const { data: subjectProfile, error: subjectError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', subjectId)
      .maybeSingle();

    if (subjectError || !subjectProfile) {
      throw new AppError('Subject citizen profile not found', 404);
    }

    // 2. Retrieve issuer organization details
    const { data: issuerOrg, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, code, domain, did, verification_status, is_issuer, authorized_credential_types')
      .eq('id', issuerOrgId)
      .maybeSingle();

    if (orgError || !issuerOrg) {
      throw new AppError('Issuer organization not found', 404);
    }

    // 3. Verify actor membership and role in issuing organization
    if (actor.role !== 'ADMIN') {
      const { data: member, error: memberError } = await supabaseAdmin
        .from('organization_members')
        .select('member_role, status')
        .eq('organization_id', issuerOrgId)
        .eq('user_id', actor.id)
        .maybeSingle();

      if (memberError || !member || member.status !== 'ACTIVE' || !['ADMIN', 'ISSUER'].includes(member.member_role)) {
        throw new AppError('Forbidden. Actor is not authorized to issue credentials for this organization.', 403);
      }
    }

    // 4. Verify organization is an approved issuer
    if (issuerOrg.verification_status !== 'APPROVED' || !issuerOrg.is_issuer) {
      if (actor.role !== 'ADMIN') {
        throw new AppError('Organization is not an approved credential issuer', 403);
      }
    }

    // 4b. Enforce organization authorized credential types
    if (actor.role !== 'ADMIN') {
      const authorizedTypes: string[] = Array.isArray(issuerOrg.authorized_credential_types)
        ? issuerOrg.authorized_credential_types
        : [];

      if (authorizedTypes.length > 0 && !authorizedTypes.includes(credentialType)) {
        throw new AppError(
          `Forbidden. Organization "${issuerOrg.name}" is not authorized to issue credential type "${credentialType}". Authorized types: ${authorizedTypes.join(', ')}`,
          403
        );
      }
    }

    // 5. Generate issuance timestamp & signature
    const issuanceDate = new Date().toISOString();
    const signature = this.generateCredentialSignature(
      issuerOrg.did,
      subjectId,
      domain,
      credentialType,
      issuanceDate,
      claims
    );

    const tempId = crypto.randomUUID();
    const qrPayload = `credlink:vc:${tempId}:${crypto.createHash('sha256').update(signature).digest('hex').substring(0, 16)}`;

    // 6. Insert credential into database
    const { data: newCredential, error: insertError } = await supabaseAdmin
      .from('credentials')
      .insert({
        id: tempId,
        subject_id: subjectId,
        issuer_org_id: issuerOrgId,
        domain,
        credential_type: credentialType,
        title,
        claims,
        issuance_date: issuanceDate,
        expiration_date: expirationDate || null,
        status: 'VALID',
        issuer_signature: signature,
        qr_payload: qrPayload,
      })
      .select('*')
      .single();

    if (insertError || !newCredential) {
      console.error('[CredentialService] Insert error:', insertError);
      throw new AppError('Failed to issue credential', 500);
    }

    // 7. Audit log insertion
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: issuerOrgId,
        event_type: 'CREDENTIAL_ISSUED',
        action: `Issued ${credentialType} credential (${title}) for subject ${subjectId}`,
        domain,
        outcome: 'SUCCESS',
        target_resource_id: newCredential.id,
        metadata: {
          subjectId,
          credentialType,
          issuerDid: issuerOrg.did,
          issuanceDate,
        },
      });
    } catch (auditErr) {
      console.error('[CredentialService] Audit logging warning:', auditErr);
    }

    return {
      id: newCredential.id,
      subjectId: newCredential.subject_id,
      issuerOrgId: newCredential.issuer_org_id,
      issuerDid: issuerOrg.did,
      domain: newCredential.domain,
      credentialType: newCredential.credential_type,
      title: newCredential.title,
      claims: newCredential.claims,
      issuanceDate: newCredential.issuance_date,
      expirationDate: newCredential.expiration_date,
      status: newCredential.status,
      issuerSignature: newCredential.issuer_signature,
      qrPayload: newCredential.qr_payload,
      createdAt: newCredential.created_at,
      updatedAt: newCredential.updated_at,
    };
  }

  /**
   * Retrieves paginated list of credentials scoped to authorized user access.
   */
  async listCredentials(actor: AuthUser, query: GetCredentialsQuery) {
    const { page, limit, domain, status, subjectId, issuerOrgId } = query;
    const offset = (page - 1) * limit;

    const { data: memberships } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', actor.id)
      .eq('status', 'ACTIVE');

    const userOrgIds = (memberships || []).map((m) => m.organization_id);

    let queryBuilder = supabaseAdmin
      .from('credentials')
      .select('*, issuer:organizations(id, name, code, did)', { count: 'exact' });

    if (actor.role !== 'ADMIN') {
      if (subjectId) {
        if (subjectId === actor.id) {
          queryBuilder = queryBuilder.eq('subject_id', actor.id);
        } else if (userOrgIds.length > 0) {
          queryBuilder = queryBuilder.eq('subject_id', subjectId).in('issuer_org_id', userOrgIds);
        } else {
          throw new AppError('Forbidden. You are not authorized to access credentials for this subject.', 403);
        }
      } else {
        if (userOrgIds.length > 0) {
          queryBuilder = queryBuilder.or(`subject_id.eq.${actor.id},issuer_org_id.in.(${userOrgIds.join(',')})`);
        } else {
          queryBuilder = queryBuilder.eq('subject_id', actor.id);
        }
      }
    } else if (subjectId) {
      queryBuilder = queryBuilder.eq('subject_id', subjectId);
    }

    if (domain) {
      queryBuilder = queryBuilder.eq('domain', domain);
    }
    if (status) {
      queryBuilder = queryBuilder.eq('status', status);
    }
    if (issuerOrgId) {
      queryBuilder = queryBuilder.eq('issuer_org_id', issuerOrgId);
    }

    const { data: credentials, count, error } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[CredentialService] List error:', error);
      throw new AppError('Failed to fetch credentials', 500);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    const credentialList = await Promise.all(
      (credentials || []).map(async (cred) => {
        let revocationReason: string | null = null;
        let revokedAt: string | null = null;
        if (cred.status === 'REVOKED') {
          const revMeta = await this.getRevocationMetadata(cred.id);
          revocationReason = revMeta.reason;
          revokedAt = revMeta.revokedAt;
        }

        const issuerObj = Array.isArray(cred.issuer) ? cred.issuer[0] : cred.issuer;

        return {
          id: cred.id,
          subjectId: cred.subject_id,
          issuerOrgId: cred.issuer_org_id,
          issuer: issuerObj ? { id: issuerObj.id, name: issuerObj.name, did: issuerObj.did } : null,
          domain: cred.domain,
          credentialType: cred.credential_type,
          title: cred.title,
          claims: cred.claims,
          issuanceDate: cred.issuance_date,
          expirationDate: cred.expiration_date,
          status: cred.status,
          revocationReason,
          revokedAt,
          issuerSignature: cred.issuer_signature,
          qrPayload: cred.qr_payload,
          createdAt: cred.created_at,
          updatedAt: cred.updated_at,
        };
      })
    );

    return {
      credentials: credentialList,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves single credential by ID with strict access control.
   */
  async getCredentialById(actor: AuthUser, id: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new AppError('Invalid credential ID format', 400);
    }

    const { data: cred, error } = await supabaseAdmin
      .from('credentials')
      .select('*, issuer:organizations(id, name, code, did)')
      .eq('id', id)
      .maybeSingle();

    if (error || !cred) {
      throw new AppError('Credential not found', 404);
    }

    // Access control check
    if (actor.role !== 'ADMIN' && cred.subject_id !== actor.id) {
      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('member_role')
        .eq('organization_id', cred.issuer_org_id)
        .eq('user_id', actor.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (!member) {
        const { data: consent } = await supabaseAdmin
          .from('consents')
          .select('id')
          .eq('citizen_id', cred.subject_id)
          .eq('status', 'APPROVED')
          .or(`credential_id.eq.${cred.id},domain.eq.${cred.domain},domain.eq.all`)
          .maybeSingle();

        if (!consent) {
          throw new AppError('Forbidden. You are not authorized to view this credential.', 403);
        }
      }
    }

    let revocationReason: string | null = null;
    let revokedAt: string | null = null;

    if (cred.status === 'REVOKED') {
      const revMeta = await this.getRevocationMetadata(cred.id);
      revocationReason = revMeta.reason;
      revokedAt = revMeta.revokedAt;
    }

    const issuerObj = Array.isArray(cred.issuer) ? cred.issuer[0] : cred.issuer;

    return {
      id: cred.id,
      subjectId: cred.subject_id,
      issuerOrgId: cred.issuer_org_id,
      issuer: issuerObj ? { id: issuerObj.id, name: issuerObj.name, did: issuerObj.did } : null,
      domain: cred.domain,
      credentialType: cred.credential_type,
      title: cred.title,
      claims: cred.claims,
      issuanceDate: cred.issuance_date,
      expirationDate: cred.expiration_date,
      status: cred.status,
      revocationReason,
      revokedAt,
      issuerSignature: cred.issuer_signature,
      qrPayload: cred.qr_payload,
      createdAt: cred.created_at,
      updatedAt: cred.updated_at,
    };
  }

  /**
   * Revokes an issued credential.
   * Updates status to REVOKED and logs audit record.
   */
  async revokeCredential(actor: AuthUser, id: string, input: RevokeCredentialInput) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new AppError('Invalid credential ID format', 400);
    }

    const { data: cred, error } = await supabaseAdmin
      .from('credentials')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !cred) {
      throw new AppError('Credential not found', 404);
    }

    if (cred.status === 'REVOKED') {
      throw new AppError('Credential is already revoked', 400);
    }

    // Verify actor is authorized issuer/admin of issuer_org_id
    if (actor.role !== 'ADMIN') {
      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('member_role, status')
        .eq('organization_id', cred.issuer_org_id)
        .eq('user_id', actor.id)
        .maybeSingle();

      if (!member || member.status !== 'ACTIVE' || !['ADMIN', 'ISSUER'].includes(member.member_role)) {
        throw new AppError('Forbidden. Only authorized issuers or administrators of the issuing organization can revoke this credential.', 403);
      }
    }

    const revokedAt = new Date().toISOString();
    const { data: updatedCred, error: updateError } = await supabaseAdmin
      .from('credentials')
      .update({
        status: 'REVOKED',
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updatedCred) {
      console.error('[CredentialService] Revoke update error:', updateError);
      throw new AppError('Failed to revoke credential', 500);
    }

    // Audit log insertion
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: cred.issuer_org_id,
        event_type: 'CREDENTIAL_REVOKED',
        action: `Revoked credential ${id}. Reason: ${input.reason}`,
        domain: cred.domain,
        outcome: 'SUCCESS',
        target_resource_id: id,
        metadata: {
          reason: input.reason,
          revokedAt,
        },
      });
    } catch (auditErr) {
      console.error('[CredentialService] Audit logging warning:', auditErr);
    }

    return {
      id: updatedCred.id,
      subjectId: updatedCred.subject_id,
      issuerOrgId: updatedCred.issuer_org_id,
      domain: updatedCred.domain,
      credentialType: updatedCred.credential_type,
      title: updatedCred.title,
      status: updatedCred.status,
      revocationReason: input.reason,
      revokedAt,
      updatedAt: updatedCred.updated_at,
    };
  }

  /**
   * Performs cryptographic signature verification & status validation.
   */
  async verifyCredential(_actor: AuthUser, input: VerifyCredentialInput) {
    let credData: any = null;

    if (input.credentialId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.credentialId)) {
        throw new AppError('Invalid credential ID format', 400);
      }

      const { data: cred, error } = await supabaseAdmin
        .from('credentials')
        .select('*, issuer:organizations(did)')
        .eq('id', input.credentialId)
        .maybeSingle();

      if (error || !cred) {
        throw new AppError('Credential not found for verification', 404);
      }
      credData = cred;
    } else if (input.credentialPayload) {
      credData = input.credentialPayload;
    } else {
      throw new AppError('Either credentialId or credentialPayload must be provided for verification', 400);
    }

    const isRevoked = credData.status === 'REVOKED';
    const isExpired = credData.expiration_date ? new Date(credData.expiration_date) < new Date() : false;

    // Fetch revocation details if revoked
    let revocationReason: string | null = credData.revocation_reason || null;
    let revokedAt: string | null = credData.revoked_at || null;
    if (isRevoked && !revocationReason && credData.id) {
      const revMeta = await this.getRevocationMetadata(credData.id);
      revocationReason = revMeta.reason;
      revokedAt = revMeta.revokedAt;
    }

    // Resolve issuer DID from joined object or query fallback
    let issuerDid: string = '';
    const issuerObj = Array.isArray(credData.issuer) ? credData.issuer[0] : credData.issuer;
    if (issuerObj?.did) {
      issuerDid = issuerObj.did;
    } else if (credData.issuerDid) {
      issuerDid = credData.issuerDid;
    } else if (credData.issuer_org_id) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('did')
        .eq('id', credData.issuer_org_id)
        .maybeSingle();
      issuerDid = org?.did || `did:credlink:org:${credData.issuer_org_id}`;
    } else {
      issuerDid = 'did:credlink:org:unknown';
    }

    const expectedSignature = this.generateCredentialSignature(
      issuerDid,
      credData.subject_id || credData.subjectId,
      credData.domain,
      credData.credential_type || credData.credentialType,
      credData.issuance_date || credData.issuanceDate,
      credData.claims
    );

    const signatureValid = credData.issuer_signature === expectedSignature || credData.issuerSignature === expectedSignature;

    const overallValid = !isRevoked && !isExpired && signatureValid && credData.status === 'VALID';

    return {
      valid: overallValid,
      applicationStatus: isRevoked ? 'REVOKED' : isExpired ? 'EXPIRED' : credData.status,
      cryptographicVerification: {
        signatureValid,
        algorithm: 'HMAC-SHA256',
        verifiedAt: new Date().toISOString(),
      },
      revocationDetails: {
        isRevoked,
        reason: revocationReason,
        revokedAt,
      },
      expirationDetails: {
        isExpired,
        expirationDate: credData.expiration_date || null,
      },
    };
  }
}

export const credentialService = new CredentialService();
