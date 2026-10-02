import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import { agent } from '../veramo/agent';
import { getIssuerDid } from '../veramo/issuer';
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
      .select('id, role, full_name')
      .eq('id', subjectId)
      .maybeSingle();

    if (subjectError || !subjectProfile) {
      throw new AppError('Subject citizen profile not found', 404);
    }

    if (!subjectProfile.full_name || !subjectProfile.full_name.trim()) {
      throw new AppError('Subject citizen profile is missing full name', 400);
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

    // 5. Real Veramo W3C Verifiable Credential Issuance
    const tempId = crypto.randomUUID();
    const issuanceDate = new Date().toISOString();
    const credentialIdUri = `urn:uuid:${tempId}`;
    // Only use the org's DID if it's a real Veramo-managed did:key: DID.
    // Fake did:credlink: DIDs are not managed by this agent — fall back to the persistent issuer DID.
    const effectiveIssuerDid = (issuerOrg.did && issuerOrg.did.startsWith('did:key:'))
      ? issuerOrg.did
      : getIssuerDid();

    const studentProfileId = subjectProfile.id;
    const credentialSubject: Record<string, any> = {
      id: `urn:uuid:${studentProfileId}`,
      name: subjectProfile.full_name.trim(),
      ...(typeof claims === 'object' && !Array.isArray(claims) ? claims : { items: claims }),
    };

    const verifiableCredential = await agent.createVerifiableCredential({
      credential: {
        id: credentialIdUri,
        issuer: { id: effectiveIssuerDid },
        issuanceDate,
        ...(expirationDate ? { expirationDate: new Date(expirationDate).toISOString() } : {}),
        credentialSubject,
      },
      proofFormat: 'jwt',
    });

    const signedJwt = verifiableCredential.proof.jwt;
    const jwtHash = crypto.createHash('sha256').update(signedJwt).digest('hex');
    const qrPayload = `credlink:vc:${tempId}:${jwtHash.substring(0, 16)}`;

    // 6. Insert credential archive record into database
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
        issuer_signature: signedJwt,
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
          issuerDid: effectiveIssuerDid,
          issuanceDate,
          credentialIdUri,
          jwtHash,
        },
      });
    } catch (auditErr) {
      console.error('[CredentialService] Audit logging warning:', auditErr);
    }

    return {
      id: newCredential.id,
      credentialIdUri,
      subjectId: newCredential.subject_id,
      issuerOrgId: newCredential.issuer_org_id,
      issuerDid: effectiveIssuerDid,
      domain: newCredential.domain,
      credentialType: newCredential.credential_type,
      title: newCredential.title,
      claims: newCredential.claims,
      issuanceDate: newCredential.issuance_date,
      expirationDate: newCredential.expiration_date,
      status: newCredential.status,
      issuerSignature: newCredential.issuer_signature,
      jwt: signedJwt,
      jwtHash,
      qrPayload: newCredential.qr_payload,
      w3cCredential: verifiableCredential,
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

        // Fetch subject name from profiles table
        let subjectName: string | null = null;
        if (cred.subject_id) {
          const { data: subjectProfile } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', cred.subject_id)
            .maybeSingle();
          subjectName = subjectProfile?.full_name || null;
        }

        return {
          id: cred.id,
          subjectId: cred.subject_id,
          subjectName,
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
   * Performs cryptographic signature verification & status validation (Mode A).
   * Verifies signature first, extracts signed ID from VC, and checks Trust Registry + Lifecycle.
   */
  async verifyCredential(_actor: AuthUser, input: VerifyCredentialInput) {
    let rawJwt: string = '';

    if (input.credentialPayload) {
      if (typeof input.credentialPayload === 'string') {
        rawJwt = input.credentialPayload;
      } else if (typeof input.credentialPayload === 'object') {
        rawJwt =
          input.credentialPayload.jwt ||
          input.credentialPayload.issuer_signature ||
          input.credentialPayload.issuerSignature ||
          input.credentialPayload.proof?.jwt ||
          '';
      }
    }

    if (!rawJwt && input.credentialId) {
      const { data: cred } = await supabaseAdmin
        .from('credentials')
        .select('issuer_signature')
        .eq('id', input.credentialId)
        .maybeSingle();
      if (cred?.issuer_signature) {
        rawJwt = cred.issuer_signature;
      }
    }

    let detectedAlgorithm = 'Ed25519-EdDSA';
    if (rawJwt) {
      try {
        const headerParts = rawJwt.split('.');
        if (headerParts.length >= 2) {
          const parsedHeader = JSON.parse(Buffer.from(headerParts[0], 'base64url').toString('utf-8'));
          if (parsedHeader?.alg) {
            detectedAlgorithm = parsedHeader.alg === 'EdDSA' ? 'Ed25519-EdDSA' : parsedHeader.alg;
          }
        }
      } catch {
        // preserve detectedAlgorithm default
      }
    }

    if (!rawJwt) {
      return {
        valid: false,
        reason: 'Missing credential JWT for verification',
        applicationStatus: 'INVALID',
        cryptographicVerification: { signatureValid: false, algorithm: detectedAlgorithm },
      };
    }

    // Step 1: Cryptographic signature verification FIRST
    let verificationResult: any = null;
    try {
      verificationResult = await agent.verifyCredential({ credential: rawJwt });
    } catch (verifyErr: any) {
      return {
        valid: false,
        reason: `signature invalid: ${verifyErr.message}`,
        applicationStatus: 'INVALID',
        cryptographicVerification: { signatureValid: false, algorithm: detectedAlgorithm },
      };
    }

    // Detect actual verified key algorithm and curve from Veramo signer
    if (verificationResult?.signer?.publicKeyJwk?.alg) {
      const crv = verificationResult.signer.publicKeyJwk.crv;
      const alg = verificationResult.signer.publicKeyJwk.alg;
      detectedAlgorithm = crv ? `${crv}-${alg}` : alg;
    }

    if (!verificationResult || !verificationResult.verified) {
      return {
        valid: false,
        reason: 'signature invalid',
        applicationStatus: 'INVALID',
        cryptographicVerification: {
          signatureValid: false,
          algorithm: detectedAlgorithm,
          error: verificationResult?.error?.message,
        },
      };
    }

    // Step 2: Extract signed ID & issuer DID from verified VC ONLY (never trusting client input)
    const verifiedVc = verificationResult.verifiableCredential;
    const signedIdUri: string = verifiedVc.id || '';
    const extractedDbId = signedIdUri.replace(/^urn:uuid:/, '');
    const issuerDid: string = typeof verifiedVc.issuer === 'string' ? verifiedVc.issuer : verifiedVc.issuer?.id;

    // Step 3: Fetch credential record from credentials table using extractedDbId ONLY
    const { data: credRecord } = await supabaseAdmin
      .from('credentials')
      .select('*')
      .eq('id', extractedDbId)
      .maybeSingle();

    if (!credRecord) {
      return {
        valid: false,
        reason: 'credential record not found in issuer archive',
        applicationStatus: 'NOT_FOUND',
        cryptographicVerification: { signatureValid: true, algorithm: detectedAlgorithm },
      };
    }

    // Step 4: Check Trust Registry for issuer DID
    const { data: trustEntry } = await supabaseAdmin
      .from('trust_registry')
      .select('*, organization:organizations(id, name, code, domain, did, is_issuer, verification_status)')
      .eq('issuer_identifier', issuerDid)
      .maybeSingle();

    if (!trustEntry || trustEntry.trust_status !== 'VERIFIED') {
      return {
        valid: false,
        reason: trustEntry?.trust_status === 'SUSPENDED' ? 'issuer suspended' : 'issuer not trusted',
        applicationStatus: 'REJECTED',
        cryptographicVerification: { signatureValid: true, algorithm: detectedAlgorithm },
        trustRegistryCheck: { isTrusted: false, status: trustEntry?.trust_status || 'UNREGISTERED' },
      };
    }

    // Step 4b: Domain accreditation enforcement — issuer must be accredited for THIS credential's domain.
    // If trust registry entry has no domain metadata or does not match credRecord.domain, treat as failed check.
    const accreditedFor: string | undefined = trustEntry.verification_metadata?.accredited_for;
    if (!accreditedFor || accreditedFor !== credRecord.domain) {
      return {
        valid: false,
        reason: 'issuer not accredited for this domain',
        applicationStatus: 'REJECTED',
        cryptographicVerification: { signatureValid: true, algorithm: detectedAlgorithm },
        trustRegistryCheck: {
          isTrusted: false,
          status: trustEntry.trust_status,
          accreditedFor: accreditedFor || null,
          requiredDomain: credRecord.domain,
        },
      };
    }

    // Step 5: Check lifecycle / revocation in credentials table
    const isRevoked = credRecord.status === 'REVOKED';
    const isExpired = credRecord.expiration_date ? new Date(credRecord.expiration_date) < new Date() : false;

    if (isRevoked) {
      const revMeta = await this.getRevocationMetadata(credRecord.id);
      return {
        valid: false,
        reason: 'credential revoked',
        applicationStatus: 'REVOKED',
        cryptographicVerification: { signatureValid: true, algorithm: detectedAlgorithm },
        revocationDetails: { isRevoked: true, reason: revMeta.reason, revokedAt: revMeta.revokedAt },
      };
    }

    if (isExpired) {
      return {
        valid: false,
        reason: 'credential expired',
        applicationStatus: 'EXPIRED',
        cryptographicVerification: { signatureValid: true, algorithm: detectedAlgorithm },
        expirationDetails: { isExpired: true, expirationDate: credRecord.expiration_date },
      };
    }

    if (credRecord.status !== 'VALID') {
      return {
        valid: false,
        reason: `credential status is ${credRecord.status}`,
        applicationStatus: credRecord.status,
        cryptographicVerification: { signatureValid: true, algorithm: detectedAlgorithm },
      };
    }

    return {
      valid: true,
      reason: null,
      applicationStatus: 'VALID',
      credentialId: extractedDbId,
      credentialIdUri: signedIdUri,
      issuerDid,
      subjectId: credRecord.subject_id,
      claims: verifiedVc.credentialSubject,
      cryptographicVerification: {
        signatureValid: true,
        algorithm: detectedAlgorithm,
        verifiedAt: new Date().toISOString(),
      },
      trustRegistryCheck: {
        isTrusted: true,
        trustStatus: trustEntry.trust_status,
        accreditedFor: trustEntry.verification_metadata?.accredited_for,
      },
      lifecycleDetails: {
        status: 'VALID',
        issuanceDate: credRecord.issuance_date,
        expirationDate: credRecord.expiration_date,
      },
    };
  }
}

export const credentialService = new CredentialService();
