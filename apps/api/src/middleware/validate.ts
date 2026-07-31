import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';
import { HttpError } from './errors.js';

/**
 * Express 4 swallows rejected promises from async handlers, which turns a
 * thrown domain error into a request that hangs until the client times out.
 * Every async route is wrapped in this.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/**
 * Parses and replaces `req.body` with the validated result.
 *
 * Assigning the parsed value back is deliberate: downstream handlers then see
 * coerced types and applied defaults rather than the raw JSON, so there is one
 * representation of a request rather than two.
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Parses the query string onto `res.locals.query`.
 *
 * Express 5 makes `req.query` a getter, so overwriting it in place is not
 * portable. Stashing the parsed value on `res.locals` works in both versions.
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    res.locals['query'] = result.data;
    next();
  };
}

/** Reads what `validateQuery` stored. Throws if the middleware was not applied. */
export function parsedQuery<T>(res: Response): T {
  const value = res.locals['query'] as T | undefined;
  if (value === undefined) {
    throw new Error('parsedQuery called without validateQuery on the route');
  }
  return value;
}

/**
 * Reads a required route parameter.
 *
 * Under `noUncheckedIndexedAccess`, `req.params.x` is `string | undefined` even
 * on a route that declares `:x`. This narrows it once, with a real check rather
 * than a non-null assertion, so a routing mistake surfaces as a 400 instead of
 * `undefined` reaching a repository as a lookup key.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, 'bad_request', `Missing path parameter "${name}"`);
  }
  return value;
}
