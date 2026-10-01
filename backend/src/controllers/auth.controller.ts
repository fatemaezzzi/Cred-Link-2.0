import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiResponse } from '../types';

export class AuthController {
  /**
   * POST /api/auth/register
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = registerSchema.parse(req.body);
      const result = await authService.registerUser(validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Account registered successfully',
        data: result,
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = loginSchema.parse(req.body);
      const result = await authService.loginUser(validatedInput);

      const response: ApiResponse = {
        success: true,
        message: 'Login successful',
        data: result,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/logout
   */
  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.token) {
        await authService.logoutUser(req.token);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/auth/me
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

      const userDetails = await authService.getCurrentUser(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: userDetails,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
