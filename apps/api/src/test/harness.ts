import type { DraftEmail } from '@reap/shared';
import type { Express } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import type { Container } from '../container.js';
import { createContainer } from '../container.js';
import { seed } from '../db/seed.js';
import { RulesClassifier } from '../services/classifier/rules.js';
import { SimulatedInboxProvider } from '../services/inbox/simulated.js';
import type { Mailer, SentMessage } from '../services/mailer.js';

/**
 * A mailer that records instead of sending, and can be told to fail.
 *
 * Lets the approval path be tested for both outcomes without any network.
 */
export class StubMailer implements Mailer {
  readonly name = 'stub';
  readonly sent: SentMessage[] = [];

  shouldFail = false;

  async send(draft: DraftEmail): Promise<SentMessage> {
    if (this.shouldFail) {
      throw new Error('SMTP connection refused');
    }

    const sent: SentMessage = { ...draft, sentAt: new Date().toISOString() };
    this.sent.push(sent);
    return sent;
  }
}

export interface Harness {
  app: Express;
  container: Container;
  mailer: StubMailer;
  /** Runs one ingestion pass so the queue has pending activities. */
  ingest: () => Promise<void>;
  cleanup: () => void;
}

/**
 * Builds a complete application over an in-memory database and a temporary
 * documents directory.
 *
 * Each test gets its own isolated instance, so they can run in parallel and
 * cannot leak state into one another.
 */
export function createHarness(options: { seeded?: boolean } = {}): Harness {
  const documentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-test-'));
  const mailer = new StubMailer();

  const container = createContainer({
    databasePath: ':memory:',
    documentsDir,
    mailer,
    classifier: new RulesClassifier(),
    inbox: new SimulatedInboxProvider(),
  });

  if (options.seeded !== false) {
    seed(container);
  }

  return {
    app: createApp(container),
    container,
    mailer,
    ingest: async () => {
      await container.services.ingestion.pollOnce();
    },
    cleanup: () => {
      container.db.close();
      fs.rmSync(documentsDir, { recursive: true, force: true });
    },
  };
}
