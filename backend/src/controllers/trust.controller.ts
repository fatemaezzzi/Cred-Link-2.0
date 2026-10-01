import { Response, NextFunction } from 'express';
import { trustService } from '../services/trust.service';
import {
  registerTrustIssuerSchema,
  updateTrustStatusSchema,
  getTrustRegistryQuerySchema,
  comprehensiveVerifySchema,
} from '../validators/trust.validator';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiResponse } from '../types';

export class TrustController {
  /**
   * GET /api/trust-registry
   * Retrieves paginated list of registered trusted issuers.
   */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedQuery = getTrustRegistryQuerySchema.parse(req.query);
      const result = await trustService.listTrustRegistry(validatedQuery);

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

  /**
   * GET /api/trust-registry/:orgId
   * Retrieves trust registry details for a specific organization ID or DID.
   */
  async getByOrgId(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.params.orgId as string;
      const trustDetails = await trustService.getTrustByOrgId(orgId);

      const response: ApiResponse = {
        success: true,
        data: trustDetails,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/trust-registry/register
   * Network Admin registers an approved organization in the Trust Registry.
   */
  async registerIssuer(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = registerTrustIssuerSchema.parse(req.body);
      const registeredIssuer = await trustService.registerIssuer(req.user, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Issuer registered in Trust Registry successfully',
        data: registeredIssuer,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/trust-registry/:id/status
   * Network Admin updates the trust status (VERIFIED, SUSPENDED, REVOKED) of an issuer.
   */
  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const id = req.params.id as string;
      const validatedInput = updateTrustStatusSchema.parse(req.body);
      const updatedIssuer = await trustService.updateTrustStatus(req.user, id, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Trust Registry status updated successfully',
        data: updatedIssuer,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/verification/verify-credential
   * Performs multi-layer comprehensive verification (Trust Registry, Lifecycle, Expiration, & HMAC Signature).
   */
  async verifyCredentialComprehensive(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = comprehensiveVerifySchema.parse(req.body);
      const verificationReport = await trustService.verifyCredentialComprehensive(req.user, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: `Credential verification complete: ${verificationReport.verificationResult}`,
        data: verificationReport,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}

export const trustController = new TrustController();
