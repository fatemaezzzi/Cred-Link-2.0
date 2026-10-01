import { Response, NextFunction } from 'express';
import { profileService } from '../services/profile.service';
import { updateProfileSchema } from '../validators/profile.validator';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiResponse } from '../types';

export class ProfileController {
  /**
   * GET /api/profiles/me
   * Retrieve currently authenticated user's profile.
   */
  async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const profile = await profileService.getProfile(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: profile,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/profiles/me
   * Update currently authenticated user's profile fields.
   */
  async updateMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = updateProfileSchema.parse(req.body);
      const updatedProfile = await profileService.updateProfile(req.user.id, validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Profile updated successfully',
        data: updatedProfile,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/profiles/citizens
   * Retrieve active citizen profiles for subject selection.
   */
  async listCitizens(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const citizens = await profileService.listCitizens();

      const response: ApiResponse = {
        success: true,
        data: citizens,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}

export const profileController = new ProfileController();
