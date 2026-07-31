import {
  createLeadSchema,
  listLeadsQuerySchema,
  updateLeadSchema,
  type ListLeadsQuery,
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

export function leadRoutes(container: Container): Router {
  const router = Router();
  const { leads, audit } = container.repositories;

  router.get('/', validateQuery(listLeadsQuerySchema), (_req, res) => {
    const query = parsedQuery<ListLeadsQuery>(res);
    const { items, total } = leads.list(query);

    res.json({
      data: items,
      meta: { total, limit: query.limit, offset: query.offset },
    });
  });

  /**
   * Board summary. Registered before `/:id` so "summary" is not captured as an
   * id by the parameterised route.
   */
  router.get('/summary', (_req, res) => {
    res.json({ data: leads.pipelineSummary() });
  });

  router.get('/:id', (req, res) => {
    const lead = leads.findById(requireParam(req, 'id'));
    if (!lead) throw HttpError.notFound('Lead');
    res.json({ data: lead });
  });

  router.post('/', validateBody(createLeadSchema), (req, res) => {
    const existing = leads.findByEmail(req.body.email);
    if (existing) {
      throw HttpError.conflict(`A lead already exists for ${req.body.email}`);
    }

    const lead = leads.create(req.body);

    audit.record({
      actor: 'user',
      action: 'lead.created',
      subjectType: 'lead',
      subjectId: lead.id,
      summary: `Created ${lead.side} lead ${lead.name} <${lead.email}>`,
      detail: { stage: lead.stage, source: lead.source },
    });

    res.status(201).json({ data: lead });
  });

  router.patch('/:id', validateBody(updateLeadSchema), (req, res) => {
    const id = requireParam(req, 'id');
    const before = leads.findById(id);
    if (!before) throw HttpError.notFound('Lead');

    const lead = leads.update(id, req.body);
    if (!lead) throw HttpError.notFound('Lead');

    audit.record({
      actor: 'user',
      action: 'lead.updated',
      subjectType: 'lead',
      subjectId: lead.id,
      summary:
        before.stage === lead.stage
          ? `Updated lead ${lead.name}`
          : `Moved ${lead.name} from "${before.stage}" to "${lead.stage}"`,
      detail: { changes: req.body },
    });

    res.json({ data: lead });
  });

  return router;
}
