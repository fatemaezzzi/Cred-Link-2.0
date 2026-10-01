import { Request, Response, NextFunction } from 'express';
import { organizationService } from '../services/organization.service';
import { createOrganizationSchema, getOrganizationsQuerySchema } from '../validators/organization.validator';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiResponse } from '../types';

export class OrganizationController {
  /**
   * GET /api/organizations
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedQuery = getOrganizationsQuerySchema.parse(req.query);
      const result = await organizationService.listOrganizations(validatedQuery);

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
   * GET /api/organizations/:id
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organization = await organizationService.getOrganizationById(id);

      const response: ApiResponse = {
        success: true,
        data: organization,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/organizations
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

      const validatedInput = createOrganizationSchema.parse(req.body);
      const newOrganization = await organizationService.createOrganization(req.user.id, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Organization registration submitted successfully and is pending verification',
        data: newOrganization,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/organizations/:id/status
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
      const { verificationStatus, isIssuer, authorizedCredentialTypes } = req.body;

      if (!['PENDING', 'APPROVED', 'DENIED'].includes(verificationStatus)) {
        res.status(400).json({
          success: false,
          error: 'Invalid verificationStatus. Must be PENDING, APPROVED, or DENIED.',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const updated = await organizationService.updateOrganizationStatus(req.user, id, {
        verificationStatus,
        isIssuer,
        authorizedCredentialTypes,
      });

      const response: ApiResponse = {
        success: true,
        message: 'Organization status updated successfully',
        data: updated,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}

export const organizationController = new OrganizationController();
