import { listAuditQuerySchema, type ListAuditQuery } from '@reap/shared';
import { Router } from 'express';
import { SERVICE_VERSION, env } from '../config.js';
import type { Container } from '../container.js';
import { asyncHandler, parsedQuery, validateQuery } from '../middleware/validate.js';

/** Health, inbox control, and the audit trail. */
export function systemRoutes(container: Container): Router {
  const router = Router();
  const { audit, activities } = container.repositories;
  const ingestion = container.services.ingestion;

  router.get('/health', (_req, res) => {
    res.json({
      data: {
        status: 'ok' as const,
        version: SERVICE_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        inbox: {
          provider: ingestion.providerName,
          polling: ingestion.isPolling,
          lastPolledAt: ingestion.lastPollIso,
        },
        classifier: container.services.classifier.name,
      },
    });
  });

  router.get('/inbox/status', (_req, res) => {
    res.json({
      data: {
        provider: ingestion.providerName,
        polling: ingestion.isPolling,
        lastPolledAt: ingestion.lastPollIso,
        pendingCount: activities.countByStatus('pending'),
        processedCount: activities.count(),
      },
    });
  });

  router.post('/inbox/start', (_req, res) => {
    ingestion.start();
    res.json({ data: { polling: true } });
  });

  router.post('/inbox/stop', (_req, res) => {
    ingestion.stop();
    res.json({ data: { polling: false } });
  });

  /** Forces an immediate poll. Lets the UI offer a "check now" button. */
  router.post(
    '/inbox/poll',
    asyncHandler(async (_req, res) => {
      const result = await ingestion.pollOnce();
      res.json({ data: result });
    }),
  );

  router.get('/audit', validateQuery(listAuditQuerySchema), (_req, res) => {
    const query = parsedQuery<ListAuditQuery>(res);
    const { items, total } = audit.list(query);

    res.json({
      data: items,
      meta: { total, limit: query.limit, offset: query.offset },
    });
  });

  router.get('/agent', (_req, res) => {
    res.json({ data: container.agent });
  });

  router.get('/config', (_req, res) => {
    // Deliberately narrow: which strategies are active, never their credentials.
    res.json({
      data: {
        inboxProvider: env.INBOX_PROVIDER,
        classifier: env.CLASSIFIER,
        mailer: container.services.mailer.name,
        pollIntervalMs: env.INBOX_POLL_INTERVAL_MS,
      },
    });
  });

  return router;
}
