import { Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiResponse } from '../types';

export class AuditController {
  /**
   * GET /api/audit-logs
   */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const query = {
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 25,
        domain: req.query.domain as string | undefined,
        eventType: req.query.eventType as string | undefined,
        search: req.query.search as string | undefined,
      };

      const result = await auditService.listLogs(req.user, query);

      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}

export const auditController = new AuditController();
