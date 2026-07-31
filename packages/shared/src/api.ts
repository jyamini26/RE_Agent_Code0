import { z } from 'zod';
import {
  activitySchema,
  activityStatusSchema,
  auditEntrySchema,
  documentSchema,
  leadSchema,
  leadStageSchema,
  propertySchema,
  propertyStatusSchema,
} from './domain.js';

/**
 * Transport contracts.
 *
 * Every endpoint returns either `{ data, meta? }` or `{ error }`, never a bare
 * value. Callers can therefore discriminate on the presence of `error` without
 * inspecting the HTTP status, which keeps the client's error handling in one
 * place.
 */

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Present for 422s: per-field validation failures. */
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const paginationMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data });
}

export function paginatedEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/**
 * Query strings arrive as strings, so numeric bounds are coerced. Defaults are
 * applied here rather than in each route so paging behaviour cannot drift
 * between endpoints.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listActivitiesQuerySchema = paginationQuerySchema.extend({
  status: activityStatusSchema.optional(),
});
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  stage: leadStageSchema.optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const listPropertiesQuerySchema = paginationQuerySchema.extend({
  status: propertyStatusSchema.optional(),
});
export type ListPropertiesQuery = z.infer<typeof listPropertiesQuerySchema>;

export const listAuditQuerySchema = paginationQuerySchema.extend({
  subjectId: z.string().max(64).optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const activityResponseSchema = envelope(activitySchema);
export const activityListResponseSchema = paginatedEnvelope(activitySchema);
export const leadResponseSchema = envelope(leadSchema);
export const leadListResponseSchema = paginatedEnvelope(leadSchema);
export const propertyResponseSchema = envelope(propertySchema);
export const propertyListResponseSchema = paginatedEnvelope(propertySchema);
export const documentResponseSchema = envelope(documentSchema);
export const documentListResponseSchema = paginatedEnvelope(documentSchema);
export const auditListResponseSchema = paginatedEnvelope(auditEntrySchema);

export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  inbox: z.object({
    provider: z.string(),
    polling: z.boolean(),
    lastPolledAt: z.string().nullable(),
  }),
  classifier: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

export const healthResponseSchema = envelope(healthSchema);

export const inboxStatusSchema = z.object({
  provider: z.string(),
  polling: z.boolean(),
  lastPolledAt: z.string().nullable(),
  pendingCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
});
export type InboxStatus = z.infer<typeof inboxStatusSchema>;

export const inboxStatusResponseSchema = envelope(inboxStatusSchema);

export const pipelineSummarySchema = z.object({
  stages: z.array(
    z.object({
      stage: leadStageSchema,
      count: z.number().int().nonnegative(),
      valueUsd: z.number().int().nonnegative(),
    }),
  ),
  totalLeads: z.number().int().nonnegative(),
});
export type PipelineSummary = z.infer<typeof pipelineSummarySchema>;

export const pipelineSummaryResponseSchema = envelope(pipelineSummarySchema);
