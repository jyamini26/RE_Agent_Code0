import type { InboundMessage } from '@reap/shared';
import type { InboxProvider } from './types.js';
import { logger } from '../../logger.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Gmail message payload, narrowed to the fields this provider reads.
 *
 * Hand-written rather than pulled from `googleapis`: that package vendors the
 * entire Google API surface (hundreds of megabytes, and a transitive
 * vulnerability chain through gaxios) to call two endpoints. A typed fetch
 * client is smaller, has no dependencies, and is trivially stubbable in tests.
 */
export interface GmailMessagePart {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface GmailListResponse {
  messages?: Array<{ id?: string }>;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

export interface GmailProviderOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Gmail search expression. Narrow this to avoid ingesting newsletters. */
  query?: string;
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Polls a real Gmail mailbox over the REST API.
 *
 * Authenticates with a long-lived refresh token so the service runs headless.
 * The token is read from the environment and never written to disk.
 */
export class GmailInboxProvider implements InboxProvider {
  readonly name = 'gmail';

  private readonly options: Required<Omit<GmailProviderOptions, 'fetchImpl'>>;
  private readonly fetchImpl: typeof fetch;

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(options: GmailProviderOptions) {
    this.options = {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      refreshToken: options.refreshToken,
      query: options.query ?? 'is:unread -category:promotions -category:social',
    };
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async fetchRecent(options: {
    since: Date | null;
    limit: number;
  }): Promise<InboundMessage[]> {
    const { since, limit } = options;

    // Gmail's `after:` operator takes whole seconds since the epoch.
    const query = since
      ? `${this.options.query} after:${Math.floor(since.getTime() / 1000)}`
      : this.options.query;

    const list = await this.request<GmailListResponse>(
      `/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`,
    );

    const ids = (list.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => typeof id === 'string');

    // The list endpoint returns ids only, so each message needs its own fetch.
    // Settled rather than all: one unreadable message should not discard the
    // whole batch.
    const results = await Promise.allSettled(ids.map((id) => this.fetchMessage(id)));

    const messages: InboundMessage[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        messages.push(result.value);
      } else if (result.status === 'rejected') {
        logger.warn(`[gmail] failed to fetch a message: ${String(result.reason)}`);
      }
    }

    return messages;
  }

  private async fetchMessage(id: string): Promise<InboundMessage | null> {
    const message = await this.request<GmailMessage>(`/messages/${id}?format=full`);

    const payload = message.payload;
    if (!payload) return null;

    const header = (name: string): string =>
      payload.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? '';

    const from = header('From');

    return {
      externalId: id,
      fromName: parseDisplayName(from),
      fromEmail: parseEmailAddress(from),
      subject: header('Subject') || '(no subject)',
      body: extractPlainText(payload).slice(0, 20_000),
      receivedAt: message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : new Date().toISOString(),
    };
  }

  private async request<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();

    const response = await this.fetchImpl(`${GMAIL_BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      // The cached token was rejected; drop it and retry once with a fresh one.
      this.accessToken = null;
      const retryToken = await this.getAccessToken();
      const retry = await this.fetchImpl(`${GMAIL_BASE}${path}`, {
        headers: { authorization: `Bearer ${retryToken}` },
      });
      if (!retry.ok) {
        throw new Error(`Gmail request failed: HTTP ${retry.status}`);
      }
      return (await retry.json()) as T;
    }

    if (!response.ok) {
      throw new Error(`Gmail request failed: HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /** Exchanges the refresh token for an access token, cached until it expires. */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Gmail token refresh failed: HTTP ${response.status}`);
    }

    const token = (await response.json()) as TokenResponse;
    if (!token.access_token) {
      throw new Error('Gmail token refresh returned no access_token');
    }

    this.accessToken = token.access_token;
    // Renew a minute early so a request cannot race the expiry.
    this.accessTokenExpiresAt = Date.now() + ((token.expires_in ?? 3600) - 60) * 1000;

    return this.accessToken;
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** `"Jane Doe" <jane@example.com>` -> `Jane Doe`. */
export function parseDisplayName(from: string): string {
  const bracketed = from.match(/^\s*"?([^"<]*?)"?\s*</);
  const name = bracketed?.[1]?.trim();
  if (name) return name;

  // Bare address: fall back to the local part so the UI has something to show.
  const local = from.split('@')[0]?.trim();
  return local ? local.replace(/[._]/g, ' ') : from.trim();
}

/** `"Jane Doe" <jane@example.com>` -> `jane@example.com`. */
export function parseEmailAddress(from: string): string {
  const bracketed = from.match(/<([^>]+)>/);
  return (bracketed?.[1] ?? from).trim();
}

/**
 * Walks the MIME tree for the first text/plain part.
 *
 * Gmail nests parts arbitrarily deep, putting multipart/alternative inside
 * multipart/mixed, so a recursive search is required; checking only the first
 * level misses the body on most real mail.
 */
export function extractPlainText(part: GmailMessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) {
    const text = extractPlainText(child);
    if (text) return text;
  }

  // No plain alternative: fall back to stripping tags from the HTML part.
  if (part.mimeType === 'text/html' && part.body?.data) {
    return decodeBase64Url(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}
