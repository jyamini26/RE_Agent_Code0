import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load .env from the repo root so a single file configures both workspaces.
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env') });

/**
 * Environment schema.
 *
 * Every field has a default that produces a working application, so `npm run
 * dev` succeeds on a fresh clone with no .env file. Invalid values fail fast at
 * boot with a readable message rather than surfacing as an undefined deep in a
 * request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_PATH: z.string().default('./data/reap.db'),
  DOCUMENTS_DIR: z.string().default('./documents'),

  AGENT_NAME: z.string().default('Jordan Reyes'),
  AGENT_BROKERAGE: z.string().default('Meridian Residential'),
  AGENT_EMAIL: z.string().email().default('jordan@meridian.example'),
  AGENT_PHONE: z.string().default('(555) 010-0142'),
  AGENT_LICENSE: z.string().default('DRE #01234567'),

  INBOX_PROVIDER: z.enum(['simulated', 'gmail']).default('simulated'),
  INBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(300_000),
  INBOX_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(20),

  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),

  CLASSIFIER: z.enum(['rules', 'anthropic']).default('rules'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = result.data;

  // Selecting a provider without its credentials is a configuration mistake
  // worth catching at boot rather than on the first poll five minutes later.
  if (env.INBOX_PROVIDER === 'gmail') {
    const missing = (
      [
        ['GMAIL_CLIENT_ID', env.GMAIL_CLIENT_ID],
        ['GMAIL_CLIENT_SECRET', env.GMAIL_CLIENT_SECRET],
        ['GMAIL_REFRESH_TOKEN', env.GMAIL_REFRESH_TOKEN],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `INBOX_PROVIDER=gmail requires: ${missing.join(', ')}. ` +
          'Set INBOX_PROVIDER=simulated to run without Gmail credentials.',
      );
    }
  }

  if (env.CLASSIFIER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error(
      'CLASSIFIER=anthropic requires ANTHROPIC_API_KEY. ' +
        'Set CLASSIFIER=rules to run without an API key.',
    );
  }

  return env;
}

export const env = parseEnv(process.env);

export const agentProfile = {
  name: env.AGENT_NAME,
  brokerage: env.AGENT_BROKERAGE,
  email: env.AGENT_EMAIL,
  phone: env.AGENT_PHONE,
  license: env.AGENT_LICENSE,
} as const;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const SERVICE_VERSION = '1.0.0';

// Exported for unit tests that need to exercise validation failures.
export { parseEnv, envSchema };
