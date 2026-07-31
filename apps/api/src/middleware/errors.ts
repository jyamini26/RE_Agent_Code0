import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';
import {
  ActivityAlreadyResolvedError,
  ActivityNotFoundError,
  NothingToSendError,
} from '../services/activityService.js';

/** Thrown by route handlers for expected, client-visible failures. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static notFound(what: string): HttpError {
    return new HttpError(404, 'not_found', `${what} not found`);
  }

  static badRequest(message: string): HttpError {
    return new HttpError(400, 'bad_request', message);
  }

  static conflict(message: string): HttpError {
    return new HttpError(409, 'conflict', message);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` },
  });
}

/**
 * Single exit point for every failure.
 *
 * Domain errors are translated to status codes here rather than in each route,
 * so a service can throw a meaningful error without knowing about HTTP. Unknown
 * errors return a generic message: internal details go to the log, not to the
 * client.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'validation_failed',
        message: 'Request failed validation',
        issues: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof ActivityNotFoundError) {
    res.status(404).json({ error: { code: 'not_found', message: err.message } });
    return;
  }

  if (err instanceof ActivityAlreadyResolvedError) {
    res.status(409).json({ error: { code: 'conflict', message: err.message } });
    return;
  }

  if (err instanceof NothingToSendError) {
    res.status(422).json({ error: { code: 'no_draft', message: err.message } });
    return;
  }

  logger.error('[api] unhandled error:', err);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Internal server error' },
  });
}
