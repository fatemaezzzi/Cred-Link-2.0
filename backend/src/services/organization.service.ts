import { supabaseAdmin } from '../config/supabase';
import { CreateOrgInput, GetOrgsQuery } from '../validators/organization.validator';
import { AppError } from '../types';

export class OrganizationService {
  /**
   * Retrieves paginated list of organizations with optional domain filtering.
   */
  async listOrganizations(query: GetOrgsQuery) {
    const { page, limit, domain } = query;
    const offset = (page - 1) * limit;

    let queryBuilder = supabaseAdmin
      .from('organizations')
      .select('id, name, code, domain, did, verification_status, is_issuer, authorized_credential_types, created_at', {
        count: 'exact',
      });

    if (domain) {
      queryBuilder = queryBuilder.eq('domain', domain);
    }

    const { data: orgs, count, error } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError('Failed to fetch organizations', 500);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      organizations: (orgs || []).map((org) => ({
        id: org.id,
        name: org.name,
        code: org.code,
        domain: org.domain,
        did: org.did,
        status: org.verification_status,
        isIssuer: org.is_issuer,
        authorizedCredentialTypes: org.authorized_credential_types || [],
        createdAt: org.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves detailed public information for a single organization by ID.
   */
  async getOrganizationById(id: string) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new AppError('Invalid organization ID format', 400);
    }

    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, code, domain, did, verification_status, is_issuer, authorized_credential_types, created_at')
      .eq('id', id)
      .single();

    if (error || !org) {
      throw new AppError('Organization not found', 404);
    }

    return {
      id: org.id,
      name: org.name,
      code: org.code,
      domain: org.domain,
      did: org.did,
      status: org.verification_status,
      isIssuer: org.is_issuer,
      authorizedCredentialTypes: org.authorized_credential_types || [],
      createdAt: org.created_at,
    };
  }

  /**
   * Submits a new organization registration request.
   * Forces verification_status = 'PENDING' and is_issuer = FALSE.
   */
  async createOrganization(userId: string, input: CreateOrgInput) {
    const { name, code, domain, registrationRef } = input;

    // Check code uniqueness
    const { data: existingCode } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (existingCode) {
      throw new AppError(`Organization code '${code.toUpperCase()}' is already registered`, 400);
    }

    const formattedCode = code.toUpperCase();
    const generatedDid = `did:credlink:org:${formattedCode.toLowerCase()}`;

    // Create organization with forced PENDING status
    const { data: newOrg, error: createError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name,
        code: formattedCode,
        domain,
        did: generatedDid,
        registration_ref: registrationRef || null,
        verification_status: 'PENDING', // Forced server-side
        is_issuer: false, // Forced server-side
        authorized_credential_types: [], // Forced server-side
      })
      .select('*')
      .single();

    if (createError || !newOrg) {
      console.error('[OrganizationService] Creation error:', createError);
      throw new AppError('Failed to create organization registration', 500);
    }

    // Add creator to organization_members as ADMIN of their organization
    await supabaseAdmin.from('organization_members').insert({
      organization_id: newOrg.id,
      user_id: userId,
      member_role: 'ADMIN',
      status: 'ACTIVE',
    });

    return {
      id: newOrg.id,
      name: newOrg.name,
      code: newOrg.code,
      domain: newOrg.domain,
      did: newOrg.did,
      status: newOrg.verification_status,
      isIssuer: newOrg.is_issuer,
      authorizedCredentialTypes: newOrg.authorized_credential_types || [],
      createdAt: newOrg.created_at,
    };
  }

  /**
   * Network Admin updates organization verification status and issuer capabilities.
   */
  async updateOrganizationStatus(
    actor: { id: string; role: string },
    id: string,
    input: { verificationStatus: 'PENDING' | 'APPROVED' | 'DENIED'; isIssuer?: boolean; authorizedCredentialTypes?: string[] }
  ) {
    if (actor.role !== 'ADMIN') {
      throw new AppError('Forbidden. Only Network Administrators can update organization verification status.', 403);
    }

    const { verificationStatus, isIssuer, authorizedCredentialTypes } = input;
    const updateData: Record<string, any> = {
      verification_status: verificationStatus,
    };
    if (typeof isIssuer === 'boolean') {
      updateData.is_issuer = isIssuer;
    }
    if (Array.isArray(authorizedCredentialTypes)) {
      updateData.authorized_credential_types = authorizedCredentialTypes;
    }

    const { data: updatedOrg, error } = await supabaseAdmin
      .from('organizations')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !updatedOrg) {
      throw new AppError('Failed to update organization status', 500);
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        organization_id: updatedOrg.id,
        event_type: 'ORGANIZATION_STATUS_CHANGED',
        action: `Changed status of organization ${updatedOrg.name} (${updatedOrg.code}) to ${verificationStatus}`,
        domain: updatedOrg.domain,
        outcome: 'SUCCESS',
        target_resource_id: updatedOrg.id,
        metadata: updateData,
      });
    } catch (auditErr) {
      console.error('[OrganizationService] Audit log warning:', auditErr);
    }

    return {
      id: updatedOrg.id,
      name: updatedOrg.name,
      code: updatedOrg.code,
      domain: updatedOrg.domain,
      did: updatedOrg.did,
      status: updatedOrg.verification_status,
      isIssuer: updatedOrg.is_issuer,
      authorizedCredentialTypes: updatedOrg.authorized_credential_types || [],
      createdAt: updatedOrg.created_at,
    };
  }
}

export const organizationService = new OrganizationService();
