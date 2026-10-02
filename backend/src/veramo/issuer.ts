import crypto from 'crypto';
import { agent } from './agent.js';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';

let cachedIssuerOrg: any = null;

/**
 * Initializes the persistent National Institute of Technology (NIT) issuer:
 * 1. Explicitly imports private key into Veramo KMS / KeyManager.
 * 2. Explicitly binds the did:key identifier using the exact KMS key reference (importedKey.kid).
 * 3. Executes an in-memory ephemeral canary signing & verification sanity check.
 * 4. Idempotently registers the NIT organization and Trust Registry record in Supabase.
 */
export async function initIssuerAgent() {
  console.log('[Veramo] Initializing persistent NIT Issuer identity...');

  // Phase 1: Explicitly import private key into Veramo KMS / KeyManager
  const importedKey = await agent.keyManagerImport({
    kid: env.ISSUER_KEY_ID,
    type: 'Ed25519',
    kms: 'local',
    privateKeyHex: env.ISSUER_PRIVATE_KEY_HEX,
  });

  // Phase 2: Explicitly register DID using importedKey.kid as controllerKeyId
  await agent.didManagerImport({
    did: env.ISSUER_DID,
    provider: 'did:key',
    controllerKeyId: importedKey.kid,
    keys: [
      {
        ...importedKey,
        privateKeyHex: env.ISSUER_PRIVATE_KEY_HEX,
      },
    ],
    services: [],
  });

  // Phase 3: Ephemeral in-memory canary sign & verify sanity check
  // (Verifies real signing ability without touching the database or leaking data)
  const canaryVc = await agent.createVerifiableCredential({
    credential: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      issuer: { id: env.ISSUER_DID },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: env.ISSUER_DID,
        canary: true,
        timestamp: Date.now(),
      },
    },
    proofFormat: 'jwt',
  });

  const canaryVerification = await agent.verifyCredential({
    credential: canaryVc,
  });

  if (!canaryVerification.verified) {
    throw new Error('[FATAL] Veramo issuer startup check failed: Ephemeral canary signature verification failed.');
  }

  console.log(`[Veramo] Issuer DID loaded and verified: ${env.ISSUER_DID} [Key: REDACTED]`);

  // Phase 4: Idempotent Database registration for National Institute of Technology
  cachedIssuerOrg = await syncIssuerDatabaseRecord(env.ISSUER_DID);
  console.log(`[Veramo] NIT Issuer organization synced in DB (ID: ${cachedIssuerOrg.id})`);

  return {
    did: env.ISSUER_DID,
    organization: cachedIssuerOrg,
  };
}

/**
 * Idempotently registers or updates National Institute of Technology in Supabase.
 */
async function syncIssuerDatabaseRecord(issuerDid: string) {
  const orgName = 'National Institute of Technology';
  const orgCode = 'NIT-001';
  const authorizedTypes = [
    'Bachelor of Technology',
    'Master of Technology',
    'Academic Transcript Attestation',
    'Degree Certificate',
  ];

  // 1. Check if organization exists by DID or Name
  let { data: existingOrg } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .or(`did.eq.${issuerDid},name.eq.${orgName}`)
    .maybeSingle();

  if (!existingOrg) {
    const { data: newOrg, error: insertError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: orgName,
        code: orgCode,
        domain: 'college',
        did: issuerDid,
        verification_status: 'APPROVED',
        is_issuer: true,
        authorized_credential_types: authorizedTypes,
      })
      .select('*')
      .single();

    if (insertError || !newOrg) {
      console.error('[Veramo] Failed to insert NIT organization:', insertError);
      throw new Error(`Failed to insert NIT organization: ${insertError?.message}`);
    }
    existingOrg = newOrg;
  } else {
    // Ensure DID, verification status, and is_issuer are updated
    const { data: updatedOrg, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({
        did: issuerDid,
        verification_status: 'APPROVED',
        is_issuer: true,
        authorized_credential_types: authorizedTypes,
      })
      .eq('id', existingOrg.id)
      .select('*')
      .single();

    if (!updateError && updatedOrg) {
      existingOrg = updatedOrg;
    }
  }

  // 2. Ensure Trust Registry entry exists and is VERIFIED
  const now = new Date().toISOString();
  const { data: existingTrust } = await supabaseAdmin
    .from('trust_registry')
    .select('*')
    .eq('organization_id', existingOrg.id)
    .maybeSingle();

  if (!existingTrust) {
    await supabaseAdmin.from('trust_registry').insert({
      organization_id: existingOrg.id,
      issuer_identifier: issuerDid,
      trust_status: 'VERIFIED',
      verification_metadata: {
        accredited_for: 'education',
        accreditedFor: 'education',
        accreditedBy: 'CredLink National Trust Registry Governance',
        registeredAt: now,
      },
      last_verified_at: now,
    });
  } else {
    await supabaseAdmin
      .from('trust_registry')
      .update({
        issuer_identifier: issuerDid,
        trust_status: 'VERIFIED',
        verification_metadata: {
          ...(existingTrust.verification_metadata || {}),
          accredited_for: 'education',
          accreditedFor: 'education',
          accreditedBy: 'CredLink National Trust Registry Governance',
          updatedAt: now,
        },
        last_verified_at: now,
      })
      .eq('id', existingTrust.id);
  }

  return existingOrg;
}

export function getIssuerDid(): string {
  return env.ISSUER_DID;
}

export function getIssuerOrg(): any {
  return cachedIssuerOrg;
}

