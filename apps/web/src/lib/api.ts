import type {
  Activity,
  ActivityStatus,
  AgentProfile,
  AuditEntry,
  Comparable,
  GeneratedDocument,
  GenerateMarketReportInput,
  Health,
  InboxStatus,
  Lead,
  LeadStage,
  PaginationMeta,
  PipelineSummary,
  Property,
  UpdateLeadInput,
} from '@reap/shared';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '/api';

/** Carries the server's error code so callers can branch without string matching. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the activity was already approved or dismissed elsewhere. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

export interface Envelope<T> {
  data: T;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  meta: PaginationMeta;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // fetch only rejects on a transport failure, which is worth distinguishing
    // from a 500: the API is unreachable rather than broken.
    throw new ApiError(0, 'network_error', 'Could not reach the API server.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload.error as { code?: string; message?: string; issues?: never })
        : null;

    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.issues,
    );
  }

  return payload as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const api = {
  // -- system --------------------------------------------------------------
  health: () => request<Envelope<Health>>('/health').then((r) => r.data),
  agent: () => request<Envelope<AgentProfile>>('/agent').then((r) => r.data),
  inboxStatus: () =>
    request<Envelope<InboxStatus>>('/inbox/status').then((r) => r.data),
  pollInbox: () =>
    request<Envelope<{ fetched: number; created: number; skipped: number }>>(
      '/inbox/poll',
      { method: 'POST' },
    ).then((r) => r.data),

  // -- activities ----------------------------------------------------------
  activities: (params: { status?: ActivityStatus; limit?: number } = {}) =>
    request<PaginatedEnvelope<Activity>>(`/activities${query(params)}`),

  approveActivity: (id: string) =>
    request<Envelope<Activity>>(`/activities/${id}/approve`, {
      method: 'POST',
    }).then((r) => r.data),

  modifyActivity: (id: string, draft: Partial<NonNullable<Activity['draft']>>) =>
    request<Envelope<Activity>>(`/activities/${id}/modify`, {
      method: 'POST',
      body: JSON.stringify({ draft }),
    }).then((r) => r.data),

  dismissActivity: (id: string, reason?: string) =>
    request<Envelope<Activity>>(`/activities/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    }).then((r) => r.data),

  // -- leads ---------------------------------------------------------------
  leads: (params: { stage?: LeadStage; limit?: number } = {}) =>
    request<PaginatedEnvelope<Lead>>(`/leads${query(params)}`),

  pipelineSummary: () =>
    request<Envelope<PipelineSummary>>('/leads/summary').then((r) => r.data),

  updateLead: (id: string, patch: UpdateLeadInput) =>
    request<Envelope<Lead>>(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }).then((r) => r.data),

  // -- properties ----------------------------------------------------------
  properties: (params: { limit?: number } = {}) =>
    request<PaginatedEnvelope<Property>>(`/properties${query(params)}`),

  // -- documents -----------------------------------------------------------
  documents: (params: { limit?: number } = {}) =>
    request<PaginatedEnvelope<GeneratedDocument>>(`/documents${query(params)}`),

  generateCma: (propertyId: string, comparables: Comparable[]) =>
    request<Envelope<GeneratedDocument>>('/documents/cma', {
      method: 'POST',
      body: JSON.stringify({ propertyId, comparables }),
    }).then((r) => r.data),

  generateBrochure: (propertyId: string) =>
    request<Envelope<GeneratedDocument>>('/documents/brochure', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    }).then((r) => r.data),

  generateMarketReport: (input: GenerateMarketReportInput) =>
    request<Envelope<GeneratedDocument>>('/documents/market-report', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => r.data),

  deleteDocument: (id: string) =>
    request<void>(`/documents/${id}`, { method: 'DELETE' }),

  // -- audit ---------------------------------------------------------------
  audit: (params: { subjectId?: string; limit?: number } = {}) =>
    request<PaginatedEnvelope<AuditEntry>>(`/audit${query(params)}`),
};
