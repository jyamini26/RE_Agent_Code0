import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config.js';

export type Db = Database.Database;

const here = path.dirname(fileURLToPath(import.meta.url));

function readSchema(): string {
  // schema.sql sits beside this module in both src/ (tsx) and dist/ (the build
  // step copies it), so a single relative lookup covers dev and production.
  return fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
}

/**
 * Opens a connection and applies the schema.
 *
 * Safe to call repeatedly: every statement in schema.sql is IF NOT EXISTS.
 */
export function openDatabase(databasePath: string = env.DATABASE_PATH): Db {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }

  const db = new Database(databasePath);

  // WAL survives across connections and keeps reads from blocking the writer.
  // It is meaningless for :memory:, which SQLite ignores rather than erroring.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(readSchema());

  return db;
}

let singleton: Db | null = null;

/** The process-wide connection. Tests build their own instead of using this. */
export function getDatabase(): Db {
  singleton ??= openDatabase();
  return singleton;
}

export function closeDatabase(): void {
  singleton?.close();
  singleton = null;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/**
 * SQLite has no JSON column type. Arrays and nested objects round-trip as TEXT,
 * and these two helpers are the only place that encoding is applied.
 */
export function encodeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function decodeJson<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T | null;
    return parsed ?? fallback;
  } catch {
    // A malformed row should degrade to an empty value rather than take down
    // the whole list endpoint it happens to appear in.
    return fallback;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Sortable, URL-safe, collision-resistant enough for a single-writer SQLite
 * database. Avoids a uuid dependency while keeping ids readable in logs.
 */
export function generateId(prefix: string): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time}${random}`;
}
