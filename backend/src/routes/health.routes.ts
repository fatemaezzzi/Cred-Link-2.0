import { Router, Request, Response, NextFunction } from 'express';
import { checkDatabaseHealth } from '../config/supabase';
import { HealthCheckResponse } from '../types';

const router = Router();

const processStartTime = Date.now();

/**
 * GET /api/health
 * Public health check endpoint for monitoring application status and database connectivity.
 */
router.get('/health', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dbResult = await checkDatabaseHealth();

    const isHealthy = dbResult.status === 'connected';
    const statusCode = isHealthy ? 200 : 503;

    const response: HealthCheckResponse = {
      status: isHealthy ? 'ok' : 'degraded',
      service: 'credlink-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - processStartTime) / 1000),
      database: {
        status: dbResult.status,
        ...(dbResult.latencyMs !== undefined && { latencyMs: dbResult.latencyMs }),
        ...(dbResult.error && { error: dbResult.error }),
      },
    };

    res.status(statusCode).json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
