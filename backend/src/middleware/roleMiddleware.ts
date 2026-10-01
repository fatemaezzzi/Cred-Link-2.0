import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware';
import { AppError } from '../types';

/**
 * Enforces role-based access control (RBAC) on routes.
 * @param allowedRoles List of roles permitted to access the route
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication context required', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden. Role '${req.user.role}' is not authorized to access this resource. Required: [${allowedRoles.join(', ')}]`,
          403
        )
      );
    }

    next();
  };
};
