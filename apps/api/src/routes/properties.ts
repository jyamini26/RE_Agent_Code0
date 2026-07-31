import {
  createPropertySchema,
  listPropertiesQuerySchema,
  updatePropertySchema,
  type ListPropertiesQuery,
} from '@reap/shared';
import { Router } from 'express';
import type { Container } from '../container.js';
import { HttpError } from '../middleware/errors.js';
import {
  parsedQuery,
  requireParam,
  validateBody,
  validateQuery,
} from '../middleware/validate.js';

export function propertyRoutes(container: Container): Router {
  const router = Router();
  const { properties, audit } = container.repositories;

  router.get('/', validateQuery(listPropertiesQuerySchema), (_req, res) => {
    const query = parsedQuery<ListPropertiesQuery>(res);
    const { items, total } = properties.list(query);

    res.json({
      data: items,
      meta: { total, limit: query.limit, offset: query.offset },
    });
  });

  router.get('/:id', (req, res) => {
    const property = properties.findById(requireParam(req, 'id'));
    if (!property) throw HttpError.notFound('Property');
    res.json({ data: property });
  });

  router.post('/', validateBody(createPropertySchema), (req, res) => {
    const property = properties.create(req.body);

    audit.record({
      actor: 'user',
      action: 'property.created',
      subjectType: 'property',
      subjectId: property.id,
      summary: `Listed ${property.address}, ${property.city}`,
      detail: { price: property.price, status: property.status },
    });

    res.status(201).json({ data: property });
  });

  router.patch('/:id', validateBody(updatePropertySchema), (req, res) => {
    const id = requireParam(req, 'id');
    const before = properties.findById(id);
    if (!before) throw HttpError.notFound('Property');

    const property = properties.update(id, req.body);
    if (!property) throw HttpError.notFound('Property');

    audit.record({
      actor: 'user',
      action: 'property.updated',
      subjectType: 'property',
      subjectId: property.id,
      summary:
        before.price === property.price
          ? `Updated ${property.address}`
          : `Repriced ${property.address} from ${before.price} to ${property.price}`,
      detail: { changes: req.body },
    });

    res.json({ data: property });
  });

  return router;
}
