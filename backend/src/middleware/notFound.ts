import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction): void => {
  const response: ApiResponse = {
    success: false,
    error: `Resource not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  };

  res.status(404).json(response);
};
