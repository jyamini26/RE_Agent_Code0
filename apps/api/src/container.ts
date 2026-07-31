import type { AgentProfile } from '@reap/shared';
import { agentProfile, env } from './config.js';
import type { Db } from './db/index.js';
import { openDatabase } from './db/index.js';
import { ActivityRepository } from './repositories/activities.js';
import { AuditRepository } from './repositories/audit.js';
import { DocumentRepository } from './repositories/documents.js';
import { LeadRepository } from './repositories/leads.js';
import { PropertyRepository } from './repositories/properties.js';
import { ActivityService } from './services/activityService.js';
import type { Classifier } from './services/classifier/index.js';
import { createClassifier } from './services/classifier/index.js';
import { DocumentService } from './services/documents.js';
import { GmailInboxProvider } from './services/inbox/gmail.js';
import { SimulatedInboxProvider } from './services/inbox/simulated.js';
import type { InboxProvider } from './services/inbox/types.js';
import { IngestionService } from './services/ingestion.js';
import type { Mailer } from './services/mailer.js';
import { ConsoleMailer } from './services/mailer.js';

/**
 * Everything the HTTP layer needs, constructed once.
 *
 * Explicit constructor injection rather than a DI framework: the graph is small
 * enough to read top to bottom, and tests build one of these with an in-memory
 * database and a stub mailer instead of reaching for module mocks.
 */
export interface Container {
  db: Db;
  agent: AgentProfile;
  repositories: {
    activities: ActivityRepository;
    leads: LeadRepository;
    properties: PropertyRepository;
    documents: DocumentRepository;
    audit: AuditRepository;
  };
  services: {
    activity: ActivityService;
    documents: DocumentService;
    ingestion: IngestionService;
    classifier: Classifier;
    mailer: Mailer;
  };
}

export interface ContainerOverrides {
  databasePath?: string;
  documentsDir?: string;
  agent?: AgentProfile;
  classifier?: Classifier;
  inbox?: InboxProvider;
  mailer?: Mailer;
  pollIntervalMs?: number;
  maxResults?: number;
}

function createInboxProvider(): InboxProvider {
  if (env.INBOX_PROVIDER === 'gmail') {
    // config.ts guarantees these are present when the provider is gmail.
    return new GmailInboxProvider({
      clientId: env.GMAIL_CLIENT_ID!,
      clientSecret: env.GMAIL_CLIENT_SECRET!,
      refreshToken: env.GMAIL_REFRESH_TOKEN!,
    });
  }

  return new SimulatedInboxProvider();
}

export function createContainer(overrides: ContainerOverrides = {}): Container {
  const db = openDatabase(overrides.databasePath ?? env.DATABASE_PATH);
  const agent = overrides.agent ?? agentProfile;

  const repositories = {
    activities: new ActivityRepository(db),
    leads: new LeadRepository(db),
    properties: new PropertyRepository(db),
    documents: new DocumentRepository(db),
    audit: new AuditRepository(db),
  };

  const classifier = overrides.classifier ?? createClassifier();
  const mailer = overrides.mailer ?? new ConsoleMailer();
  const inbox = overrides.inbox ?? createInboxProvider();

  const services = {
    classifier,
    mailer,
    activity: new ActivityService({
      activities: repositories.activities,
      leads: repositories.leads,
      audit: repositories.audit,
      mailer,
    }),
    documents: new DocumentService({
      outputDir: overrides.documentsDir ?? env.DOCUMENTS_DIR,
      agent,
    }),
    ingestion: new IngestionService({
      inbox,
      classifier,
      activities: repositories.activities,
      leads: repositories.leads,
      properties: repositories.properties,
      audit: repositories.audit,
      agent,
      pollIntervalMs: overrides.pollIntervalMs ?? env.INBOX_POLL_INTERVAL_MS,
      maxResults: overrides.maxResults ?? env.INBOX_MAX_RESULTS,
    }),
  };

  return { db, agent, repositories, services };
}
