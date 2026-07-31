import {
  generateBrochureSchema,
  generateCmaSchema,
  generateMarketReportSchema,
  paginationQuerySchema,
  type PaginationMeta,
} from '@reap/shared';
import { Router } from 'express';
import type { Container } from '../container.js';
import { HttpError } from '../middleware/errors.js';
import {
  asyncHandler,
  parsedQuery,
  requireParam,
  validateBody,
  validateQuery,
} from '../middleware/validate.js';
import type { RenderedDocument } from '../services/documents.js';

export function documentRoutes(container: Container): Router {
  const router = Router();
  const { documents, properties, audit } = container.repositories;
  const service = container.services.documents;

  /** Shared tail: persist, index, audit, respond. */
  function finalise(
    rendered: RenderedDocument,
    kind: 'cma' | 'brochure' | 'market_report',
    propertyId: string | null,
    summary: string,
  ) {
    const { sizeBytes } = service.persist(rendered);

    const record = documents.create({
      kind,
      filename: rendered.filename,
      propertyId,
      sizeBytes,
    });

    audit.record({
      actor: 'user',
      action: 'document.generated',
      subjectType: 'document',
      subjectId: record.id,
      summary,
      detail: { kind, filename: record.filename, sizeBytes },
    });

    return record;
  }

  router.get('/', validateQuery(paginationQuerySchema), (_req, res) => {
    const query = parsedQuery<PaginationMeta>(res);
    const { items, total } = documents.list(query);

    res.json({
      data: items,
      meta: { total, limit: query.limit, offset: query.offset },
    });
  });

  router.post(
    '/cma',
    validateBody(generateCmaSchema),
    asyncHandler(async (req, res) => {
      const property = properties.findById(req.body.propertyId);
      if (!property) throw HttpError.notFound('Property');

      const rendered = await service.renderCma(property, req.body.comparables);
      const record = finalise(
        rendered,
        'cma',
        property.id,
        `Generated CMA for ${property.address}`,
      );

      res.status(201).json({ data: record });
    }),
  );

  router.post(
    '/brochure',
    validateBody(generateBrochureSchema),
    asyncHandler(async (req, res) => {
      const property = properties.findById(req.body.propertyId);
      if (!property) throw HttpError.notFound('Property');

      const rendered = await service.renderBrochure(property);
      const record = finalise(
        rendered,
        'brochure',
        property.id,
        `Generated brochure for ${property.address}`,
      );

      res.status(201).json({ data: record });
    }),
  );

  router.post(
    '/market-report',
    validateBody(generateMarketReportSchema),
    asyncHandler(async (req, res) => {
      const rendered = await service.renderMarketReport(req.body);
      const record = finalise(
        rendered,
        'market_report',
        null,
        `Generated market report for ${req.body.area}`,
      );

      res.status(201).json({ data: record });
    }),
  );

  /**
   * Deletion is keyed by document id, not filename.
   *
   * The filename handed to the filesystem therefore comes from a database row
   * rather than the request path, which removes the traversal surface entirely
   * instead of trying to sanitise it. `resolveWithinDirectory` still guards the
   * write in case a row is ever populated from an untrusted source.
   */
  router.delete('/:id', (req, res) => {
    const record = documents.findById(requireParam(req, 'id'));
    if (!record) throw HttpError.notFound('Document');

    service.remove(record.filename);
    documents.delete(record.id);

    audit.record({
      actor: 'user',
      action: 'document.deleted',
      subjectType: 'document',
      subjectId: record.id,
      summary: `Deleted ${record.filename}`,
      detail: { kind: record.kind },
    });

    res.status(204).end();
  });

  return router;
}
