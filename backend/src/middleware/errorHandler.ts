import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiResponse, AppError } from '../types';
import { env } from '../config/env';

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const timestamp = new Date().toISOString();

  // Zod validation error
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    const issueSummary = formattedIssues.map((i) => `${i.field}: ${i.message}`).join(', ');

    const response: ApiResponse = {
      success: false,
      error: `Validation Error: ${issueSummary}`,
      details: formattedIssues,
      timestamp,
    };

    res.status(400).json(response);
    return;
  }

  // Known custom AppError
  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      details: err.details,
      timestamp,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Unhandled error
  console.error('[Unhandled Error]:', err);

  const response: ApiResponse = {
    success: false,
    error: env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message || 'An unexpected error occurred',
    timestamp,
  };

  res.status(500).json(response);
};
