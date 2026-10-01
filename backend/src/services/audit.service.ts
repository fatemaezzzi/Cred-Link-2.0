import { supabaseAdmin } from '../config/supabase';
import { AuthUser } from '../middleware/authMiddleware';
import { AppError } from '../types';

export interface GetAuditLogsQuery {
  page?: number;
  limit?: number;
  domain?: string;
  eventType?: string;
  search?: string;
}

export class AuditService {
  /**
   * Retrieves audit logs respecting RBAC & organization isolation.
   * - Network Admin (ADMIN) can query all logs across domains.
   * - Institution members can query their organization's audit logs.
   * - Citizens can query logs where they are the actor.
   */
  async listLogs(actor: AuthUser, query: GetAuditLogsQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    let queryBuilder = supabaseAdmin
      .from('audit_logs')
      .select('*, actor:profiles(id, full_name, email, role), organization:organizations(id, name, code, domain)', {
        count: 'exact',
      });

    // RBAC Isolation
    if (actor.role !== 'ADMIN') {
      // Find actor's organization memberships
      const { data: memberships } = await supabaseAdmin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', actor.id)
        .eq('status', 'ACTIVE');

      const orgIds = (memberships || []).map((m) => m.organization_id);

      if (orgIds.length > 0) {
        // Can view logs of their organization OR where they are the actor
        queryBuilder = queryBuilder.or(`organization_id.in.(${orgIds.join(',')}),actor_id.eq.${actor.id}`);
      } else {
        // Ordinary citizen / unaffiliated user only views their own logs
        queryBuilder = queryBuilder.eq('actor_id', actor.id);
      }
    }

    if (query.domain && query.domain !== 'ALL') {
      queryBuilder = queryBuilder.eq('domain', query.domain.toLowerCase());
    }

    if (query.eventType) {
      queryBuilder = queryBuilder.eq('event_type', query.eventType);
    }

    const { data: logs, count, error } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[AuditService] List error:', error);
      throw new AppError('Failed to fetch audit logs', 500);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      logs: (logs || []).map((l: any) => ({
        id: l.id,
        timestamp: l.created_at,
        eventType: l.event_type,
        action: l.action,
        domain: l.domain ? l.domain.toUpperCase() : 'NETWORK',
        outcome: l.outcome,
        actor: l.actor ? `${l.actor.full_name || l.actor.email} (${l.actor.role})` : (l.actor_id || 'System'),
        actorId: l.actor_id,
        organization: l.organization ? `${l.organization.name} (${l.organization.code})` : 'CredLink Network Governance',
        organizationId: l.organization_id,
        targetResourceId: l.target_resource_id,
        metadata: l.metadata || {},
        details: JSON.stringify(l.metadata || {}, null, 2),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}

export const auditService = new AuditService();
