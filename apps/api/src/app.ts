import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { corsOrigins } from './config.js';
import type { Container } from './container.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { activityRoutes } from './routes/activities.js';
import { documentRoutes } from './routes/documents.js';
import { leadRoutes } from './routes/leads.js';
import { propertyRoutes } from './routes/properties.js';
import { systemRoutes } from './routes/system.js';

/**
 * Builds the Express application.
 *
 * A factory taking a container rather than a module-level `app` is what makes
 * the integration tests real: each one constructs an app over an in-memory
 * database and a stub mailer, exercises it through HTTP with supertest, and
 * throws it away.
 */
export function createApp(container: Container): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    helmet({
      // Generated PDFs are served from this origin and fetched by a dev server
      // on another port; the default CORP header blocks that.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: corsOrigins.includes('*') ? true : corsOrigins,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Static PDFs. Served from the service's own directory, and `index: false`
  // stops the middleware from listing it.
  app.use(
    '/documents',
    express.static(container.services.documents.directory, {
      index: false,
      dotfiles: 'deny',
      maxAge: '1h',
    }),
  );

  app.use('/api', systemRoutes(container));
  app.use('/api/activities', activityRoutes(container));
  app.use('/api/leads', leadRoutes(container));
  app.use('/api/properties', propertyRoutes(container));
  app.use('/api/documents', documentRoutes(container));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
