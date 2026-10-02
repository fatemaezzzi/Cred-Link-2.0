import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import { agent } from '../veramo/agent';
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
   * Comprehensive Multi-Layer Credential Verification (Mode A & Mode B).
   * 1. Cryptographic Signature Verification via Veramo agent.
   * 2. Zero-Trust Signed ID Extraction from the verified VC (never trusting client input).
   * 3. Trust Registry Status Check (must be VERIFIED and accredited for this credential's domain).
   * 4. Lifecycle & Revocation Check in the credentials archive.
   * 5. Mode B (Bank/Hospital Verification): Active Consent Validation, Three-Way Claim Intersection,
   *    and Atomic Guarded Consent Transition (APPROVED -> CONSUMED).
   */
  async verifyCredentialComprehensive(actor: AuthUser, input: ComprehensiveVerifyInput) {
    // Resolve the raw JWT from either a direct payload or a stored credential ID
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
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.credentialId)) {
        throw new AppError('Invalid credential ID format', 400);
      }

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
        // preserve default
      }
    }

    if (!rawJwt) {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: 'Missing credential JWT for verification',
        cryptographicCheck: { signatureValid: false, algorithm: detectedAlgorithm },
      };
    }

    // Step 1: Cryptographic signature verification FIRST
    let verificationResult: any = null;
    try {
      verificationResult = await agent.verifyCredential({ credential: rawJwt });
    } catch (verifyErr: any) {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: `signature invalid: ${verifyErr.message}`,
        cryptographicCheck: { signatureValid: false, algorithm: detectedAlgorithm },
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
        verified: false,
        verificationResult: 'REJECTED',
        reason: 'signature invalid',
        cryptographicCheck: {
          signatureValid: false,
          algorithm: detectedAlgorithm,
          error: verificationResult?.error?.message,
        },
      };
    }

    // Step 2: Extract signed ID & issuer DID from the VERIFIED VC only (never trust client input)
    const verifiedVc = verificationResult.verifiableCredential;
    const signedIdUri: string = verifiedVc.id || '';
    const extractedDbId = signedIdUri.replace(/^urn:uuid:/, '');
    const issuerDid: string = typeof verifiedVc.issuer === 'string' ? verifiedVc.issuer : verifiedVc.issuer?.id;
    const verifiedSubjectUri: string = verifiedVc.credentialSubject?.id || '';
    const verifiedSubjectId = verifiedSubjectUri.replace(/^urn:uuid:/, '');

    // Step 3a: Look up the credential record first (we need its domain for the accreditation check)
    const { data: credRecord } = await supabaseAdmin
      .from('credentials')
      .select('*')
      .eq('id', extractedDbId)
      .maybeSingle();

    if (!credRecord) {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: 'credential record not found in issuer archive',
        cryptographicCheck: { signatureValid: true, algorithm: detectedAlgorithm },
      };
    }

    // Step 3b: Check Trust Registry for this issuer DID
    const { data: trustEntry } = await supabaseAdmin
      .from('trust_registry')
      .select('*, organization:organizations(id, name, code, domain, did, is_issuer, verification_status)')
      .eq('issuer_identifier', issuerDid)
      .maybeSingle();

    if (!trustEntry || trustEntry.trust_status !== 'VERIFIED') {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: trustEntry?.trust_status === 'SUSPENDED' ? 'issuer suspended' : 'issuer not trusted',
        cryptographicCheck: { signatureValid: true, algorithm: detectedAlgorithm },
        trustRegistryCheck: {
          isTrusted: false,
          issuerDid,
          trustStatus: trustEntry?.trust_status || 'UNREGISTERED',
        },
      };
    }

    // Step 3c: Domain-match enforcement — issuer must be accredited for THIS credential's domain,
    // not merely "verified" in general. No defaulting to 'education' if metadata is missing.
    const accreditedFor: string | undefined = trustEntry.verification_metadata?.accredited_for;
    if (!accreditedFor || accreditedFor !== credRecord.domain) {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: 'issuer not accredited for this domain',
        cryptographicCheck: { signatureValid: true, algorithm: 'Ed25519-EdDSA' },
        trustRegistryCheck: {
          isTrusted: false,
          issuerDid,
          trustStatus: trustEntry.trust_status,
          accreditedFor: accreditedFor || null,
          requiredDomain: credRecord.domain,
        },
      };
    }

    // Step 4: Lifecycle / revocation check
    const isRevoked = credRecord.status === 'REVOKED';
    const isExpired = credRecord.expiration_date ? new Date(credRecord.expiration_date) < new Date() : false;

    if (isRevoked) {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: 'credential revoked',
        cryptographicCheck: { signatureValid: true, algorithm: 'Ed25519-EdDSA' },
        lifecycleCheck: { status: 'REVOKED', isRevoked: true },
      };
    }

    if (isExpired) {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: 'credential expired',
        cryptographicCheck: { signatureValid: true, algorithm: 'Ed25519-EdDSA' },
        lifecycleCheck: { status: 'EXPIRED', isExpired: true, expirationDate: credRecord.expiration_date },
      };
    }

    if (credRecord.status !== 'VALID') {
      return {
        verified: false,
        verificationResult: 'REJECTED',
        reason: `credential status is ${credRecord.status}`,
        cryptographicCheck: { signatureValid: true, algorithm: 'Ed25519-EdDSA' },
      };
    }

    // Step 5: Mode B — Bank/Hospital verification request with consent (only if consentId is provided)
    let allowedClaims: Record<string, any> = verifiedVc.credentialSubject || {};
    let consentSummary: any = null;

    if (input.consentId) {
      const { data: consentRecord } = await supabaseAdmin
        .from('consents')
        .select('*')
        .eq('id', input.consentId)
        .maybeSingle();

      if (!consentRecord) {
        return { verified: false, verificationResult: 'REJECTED', reason: 'consent record not found' };
      }

      if (consentRecord.status === 'CONSUMED' || consentRecord.status === 'EXPIRED') {
        return { verified: false, verificationResult: 'REJECTED', reason: 'consent already consumed' };
      }

      if (consentRecord.status !== 'APPROVED') {
        return { verified: false, verificationResult: 'REJECTED', reason: `consent status is ${consentRecord.status}` };
      }

      if (consentRecord.expires_at && new Date(consentRecord.expires_at) < new Date()) {
        return { verified: false, verificationResult: 'REJECTED', reason: 'consent expired' };
      }

      if (
        consentRecord.citizen_id !== verifiedSubjectId &&
        consentRecord.citizen_id !== credRecord.subject_id
      ) {
        return { verified: false, verificationResult: 'REJECTED', reason: 'consent citizen does not match credential subject' };
      }

      if (input.verifierOrgId && consentRecord.requesting_org_id !== input.verifierOrgId) {
        return { verified: false, verificationResult: 'REJECTED', reason: 'consent is not authorized for this verifier organization' };
      }

      // Three-way claim intersection: Verified VC claims ∩ Bank requested ∩ Student approved
      const rawVerifiedClaims = verifiedVc.credentialSubject || {};
      const requestedClaims: string[] = Array.isArray(consentRecord.requested_claims) ? consentRecord.requested_claims : [];
      const approvedClaims: string[] = Array.isArray(consentRecord.approved_claims) ? consentRecord.approved_claims : [];

      const filteredClaims: Record<string, any> = {};
      for (const [key, value] of Object.entries(rawVerifiedClaims)) {
        if (key === 'id' || key === 'canary') continue;
        const isRequested = requestedClaims.includes(key) || requestedClaims.includes('all');
        const isApproved = approvedClaims.includes(key) || approvedClaims.includes('all');
        if (isRequested && isApproved) {
          filteredClaims[key] = value;
        }
      }
      allowedClaims = filteredClaims;

      // Atomic guarded consumption: APPROVED -> EXPIRED (respects consents_status_check in DB)
      const { data: consumedConsent, error: consumeError } = await supabaseAdmin
        .from('consents')
        .update({
          status: 'EXPIRED',
          expires_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.consentId)
        .eq('status', 'APPROVED')
        .select('*')
        .maybeSingle();

      if (consumeError || !consumedConsent) {
        return { verified: false, verificationResult: 'REJECTED', reason: 'consent could not be consumed atomically (possibly consumed by concurrent request)' };
      }

      consentSummary = {
        consentId: consentRecord.id,
        status: 'CONSUMED',
        consumedAt: new Date().toISOString(),
        purpose: consentRecord.purpose,
      };
    }

    // Step 6: Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: credRecord.issuer_org_id || null,
        event_type: 'VERIFICATION_APPROVED',
        action: `Verified credential ${extractedDbId} (URI: ${signedIdUri}) - Outcome: APPROVED`,
        domain: credRecord.domain,
        outcome: 'SUCCESS',
        target_resource_id: extractedDbId,
        metadata: {
          mode: input.consentId ? 'BANK_VERIFICATION_REQUEST' : 'BASIC_VERIFICATION',
          consentId: input.consentId || null,
          issuerDid,
        },
      });
    } catch (auditErr) {
      console.error('[TrustService] Audit log warning:', auditErr);
    }

    return {
      verified: true,
      verificationResult: 'APPROVED',
      reason: null,
      mode: input.consentId ? 'BANK_VERIFICATION_REQUEST' : 'BASIC_VERIFICATION',
      credentialSummary: {
        id: extractedDbId,
        credentialIdUri: signedIdUri,
        subjectId: credRecord.subject_id,
        domain: credRecord.domain,
        credentialType: credRecord.credential_type,
        title: credRecord.title,
        status: credRecord.status,
      },
      allowedClaims,
      consentDetails: consentSummary,
      trustRegistryCheck: {
        issuerDid,
        issuerName: trustEntry.organization?.name || 'Unknown Issuer',
        trustStatus: trustEntry.trust_status,
        isTrusted: true,
        accreditedFor,
        lastVerifiedAt: trustEntry.last_verified_at,
      },
      lifecycleCheck: {
        status: credRecord.status,
        isRevoked: false,
        isExpired: false,
        issuanceDate: credRecord.issuance_date,
        expirationDate: credRecord.expiration_date,
      },
      cryptographicCheck: {
        signatureValid: true,
        algorithm: detectedAlgorithm,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}

export const trustService = new TrustService();