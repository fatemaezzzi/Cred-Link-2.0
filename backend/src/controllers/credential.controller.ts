import { Response, NextFunction } from 'express';
import { credentialService } from '../services/credential.service';
import {
  createCredentialSchema,
  getCredentialsQuerySchema,
  revokeCredentialSchema,
  verifyCredentialSchema,
} from '../validators/credential.validator';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiResponse } from '../types';

export class CredentialController {
  /**
   * POST /api/credentials
   * Issue a new verifiable credential.
   */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = createCredentialSchema.parse(req.body);
      const newCredential = await credentialService.createCredential(req.user, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Verifiable credential issued successfully',
        data: newCredential,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/credentials
   * Retrieve paginated list of credentials authorized for user.
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

      const validatedQuery = getCredentialsQuerySchema.parse(req.query);
      const result = await credentialService.listCredentials(req.user, validatedQuery);

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
   * GET /api/credentials/:id
   * Retrieve specific credential details by ID.
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
      const credential = await credentialService.getCredentialById(req.user, id);

      const response: ApiResponse = {
        success: true,
        data: credential,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/credentials/:id/revoke
   * Revoke an issued credential.
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
      const validatedInput = revokeCredentialSchema.parse(req.body);
      const revokedCredential = await credentialService.revokeCredential(req.user, id, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Credential revoked successfully',
        data: revokedCredential,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/credentials/verify
   * Verify credential status and cryptographic signature.
   */
  async verify(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = verifyCredentialSchema.parse(req.body);
      const verificationResult = await credentialService.verifyCredential(req.user, validatedInput);

      const response: ApiResponse = {
        success: true,
        data: verificationResult,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}

export const credentialController = new CredentialController();
