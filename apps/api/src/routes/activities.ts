import {
  listActivitiesQuerySchema,
  modifyActivitySchema,
  type ListActivitiesQuery,
} from '@reap/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container.js';
import { HttpError } from '../middleware/errors.js';
import {
  asyncHandler,
  parsedQuery,
  requireParam,
  validateBody,
  validateQuery,
} from '../middleware/validate.js';

const dismissSchema = z.object({
  reason: z.string().max(500).optional(),
});

export function activityRoutes(container: Container): Router {
  const router = Router();
  const { activities } = container.repositories;
  const service = container.services.activity;

  router.get('/', validateQuery(listActivitiesQuerySchema), (_req, res) => {
    const query = parsedQuery<ListActivitiesQuery>(res);
    const { items, total } = activities.list(query);

    res.json({
      data: items,
      meta: { total, limit: query.limit, offset: query.offset },
    });
  });

  router.get('/:id', (req, res) => {
    const activity = activities.findById(requireParam(req, 'id'));
    if (!activity) throw HttpError.notFound('Activity');
    res.json({ data: activity });
  });

  /**
   * Approving is the only endpoint with an outward-facing effect. It is a POST
   * to a sub-resource rather than a PATCH on status, so the intent is explicit
   * in the access log.
   */
  router.post(
    '/:id/approve',
    asyncHandler(async (req, res) => {
      const activity = await service.approve(requireParam(req, 'id'));
      res.json({ data: activity });
    }),
  );

  router.post('/:id/modify', validateBody(modifyActivitySchema), (req, res) => {
    const activity = service.modify(requireParam(req, 'id'), req.body);
    res.json({ data: activity });
  });

  router.post('/:id/dismiss', validateBody(dismissSchema), (req, res) => {
    const activity = service.dismiss(requireParam(req, 'id'), req.body.reason);
    res.json({ data: activity });
  });

  return router;
}
