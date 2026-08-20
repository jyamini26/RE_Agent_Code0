import { createApp } from './app.js';
import { logger } from './logger.js';
import { SERVICE_VERSION, env } from './config.js';
import { createContainer } from './container.js';
import { seedIfEmpty } from './db/seed.js';
import { loadGuard } from './services/guard/index.js';

// Loaded before the container so the safety layer is in place for the very
// first poll rather than arriving a beat late.
const guard = await loadGuard(env.GUARD_MODULE);

const container = createContainer({ guard, knownDomains: env.KNOWN_DOMAINS });

// A fresh clone should show a populated dashboard rather than empty states, so
// the demo data is planted on first boot. Existing databases are left alone.
seedIfEmpty(container);

const app = createApp(container);

const server = app.listen(env.PORT, () => {
  logger.info(
    `\n  REAP API v${SERVICE_VERSION}\n` +
      `  http://localhost:${env.PORT}/api/health\n\n` +
      `  inbox      ${container.services.ingestion.providerName}\n` +
      `  classifier ${container.services.classifier.name}\n` +
      `  mailer     ${container.services.mailer.name}\n` +
      `  database   ${env.DATABASE_PATH}\n`,
  );

  container.services.ingestion.start();
});

/**
 * Drain in-flight requests before exiting so a redeploy does not cut off a
 * client mid-approval, and close the database so WAL state is checkpointed.
 */
function shutdown(signal: string): void {
  logger.info(`\n[server] ${signal} received, shutting down`);

  container.services.ingestion.stop();

  server.close(() => {
    container.db.close();
    process.exit(0);
  });

  // Do not hang forever on a stuck connection.
  setTimeout(() => {
    logger.warn('[server] forced exit after 10s');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
