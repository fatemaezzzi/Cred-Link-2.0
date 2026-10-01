import { Response, NextFunction } from 'express';
import { consentService } from '../services/consent.service';
import {
  requestConsentSchema,
  grantConsentSchema,
  respondConsentSchema,
  getConsentsQuerySchema,
  shareCredentialSchema,
} from '../validators/consent.validator';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiResponse } from '../types';

export class ConsentController {
  /**
   * POST /api/consents/request
   * Organization member requests consent from citizen.
   */
  async request(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = requestConsentSchema.parse(req.body);
      const consentRequest = await consentService.requestConsent(req.user, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Consent request submitted successfully',
        data: consentRequest,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/consents
   * Citizen directly grants consent to an organization.
   */
  async grant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = grantConsentSchema.parse(req.body);
      const consentGrant = await consentService.grantConsent(req.user, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Consent granted successfully',
        data: consentGrant,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/consents/:id/respond
   * Citizen approves or denies a PENDING consent request.
   */
  async respond(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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
      const validatedInput = respondConsentSchema.parse(req.body);
      const result = await consentService.respondConsent(req.user, id, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: `Consent request ${validatedInput.action === 'APPROVE' ? 'approved' : 'denied'} successfully`,
        data: result,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/consents/:id/revoke
   * Citizen revokes a previously granted/approved consent.
   */
  async revoke(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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
      const result = await consentService.revokeConsent(req.user, id);

      const response: ApiResponse = {
        success: true,
        message: 'Consent revoked successfully',
        data: result,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/consents
   * Paginated listing of consents authorized for user.
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

      const validatedQuery = getConsentsQuerySchema.parse(req.query);
      const result = await consentService.listConsents(req.user, validatedQuery);

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
   * GET /api/consents/:id
   * Retrieve single consent record by ID.
   */
  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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
      const consent = await consentService.getConsentById(req.user, id);

      const response: ApiResponse = {
        success: true,
        data: consent,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/consents/share-access
   * Access shared credential data under active citizen consent (selective disclosure).
   */
  async accessSharedCredential(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = shareCredentialSchema.parse(req.body);
      const sharedData = await consentService.accessSharedCredential(req.user, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Shared credential access granted under active consent',
        data: sharedData,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}

export const consentController = new ConsentController();
