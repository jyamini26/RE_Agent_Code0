import { z } from 'zod';

/**
 * Core domain model.
 *
 * These schemas are the single source of truth for the shape of REAP data.
 * The API validates every request and response against them; the web client
 * imports the inferred types directly, so a change here surfaces as a compile
 * error on both sides rather than a runtime surprise in production.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .describe('ISO-8601 timestamp');

export const idSchema = z.string().min(1).max(64);

/** Money is stored in whole US dollars. No fractional cents in this domain. */
export const usdSchema = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

export const propertyStatusSchema = z.enum([
  'listed',
  'pending',
  'closed',
  'withdrawn',
]);
export type PropertyStatus = z.infer<typeof propertyStatusSchema>;

export const propertyTypeSchema = z.enum([
  'single_family',
  'condo',
  'townhouse',
  'multi_family',
  'land',
]);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

export const propertySchema = z.object({
  id: idSchema,
  address: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  neighborhood: z.string().max(100).nullable(),
  price: usdSchema,
  bedrooms: z.number().int().min(0).max(50),
  bathrooms: z.number().min(0).max(50),
  sqft: z.number().int().min(0).max(1_000_000),
  lotSizeSqft: z.number().int().min(0).nullable(),
  yearBuilt: z.number().int().min(1600).max(2200).nullable(),
  propertyType: propertyTypeSchema,
  status: propertyStatusSchema,
  listedAt: isoDateTime,
  description: z.string().max(4000).nullable(),
  features: z.array(z.string().max(120)).max(40),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Property = z.infer<typeof propertySchema>;

export const createPropertySchema = propertySchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({
    neighborhood: true,
    lotSizeSqft: true,
    yearBuilt: true,
    description: true,
    features: true,
    status: true,
    listedAt: true,
  });
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial();
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

/** Days a listing has been on market, derived rather than stored. */
export function daysOnMarket(property: Property, now: Date = new Date()): number {
  const listed = new Date(property.listedAt).getTime();
  const elapsedMs = now.getTime() - listed;
  return Math.max(0, Math.floor(elapsedMs / 86_400_000));
}

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

/** Ordered: the pipeline board renders columns in exactly this sequence. */
export const LEAD_STAGES = [
  'new',
  'qualified',
  'showing',
  'offer',
  'closing',
  'lost',
] as const;

export const leadStageSchema = z.enum(LEAD_STAGES);
export type LeadStage = z.infer<typeof leadStageSchema>;

export const leadTemperatureSchema = z.enum(['hot', 'warm', 'cold']);
export type LeadTemperature = z.infer<typeof leadTemperatureSchema>;

export const leadSideSchema = z.enum(['buyer', 'seller']);
export type LeadSide = z.infer<typeof leadSideSchema>;

export const leadSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(40).nullable(),
  side: leadSideSchema,
  stage: leadStageSchema,
  temperature: leadTemperatureSchema,
  source: z.string().max(80).nullable(),
  propertyId: idSchema.nullable(),
  budgetMin: usdSchema.nullable(),
  budgetMax: usdSchema.nullable(),
  notes: z.string().max(4000).nullable(),
  lastContactAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Lead = z.infer<typeof leadSchema>;

export const createLeadSchema = leadSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({
    phone: true,
    stage: true,
    temperature: true,
    source: true,
    propertyId: true,
    budgetMin: true,
    budgetMax: true,
    notes: true,
    lastContactAt: true,
  })
  .refine(
    (lead) =>
      lead.budgetMin == null ||
      lead.budgetMax == null ||
      lead.budgetMin <= lead.budgetMax,
    {
      message: 'budgetMin must be less than or equal to budgetMax',
      path: ['budgetMin'],
    },
  );
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = leadSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Every intent the classifier can emit.
 *
 * Suggestion templates are keyed by this union and the mapping is exhaustive,
 * enforced by a `satisfies Record<Intent, ...>` in the suggestion engine. A new
 * intent added here fails the build until a template exists for it.
 */
export const INTENTS = [
  'inquiry',
  'new_lead',
  'showing_request',
  'offer',
  'issue',
  'follow_up',
  'unknown',
] as const;

export const intentSchema = z.enum(INTENTS);
export type Intent = z.infer<typeof intentSchema>;

export const classificationSchema = z.object({
  intent: intentSchema,
  /** 0-100. Higher is more positive. */
  sentiment: z.number().int().min(0).max(100),
  /** 0-100. How sure the classifier is of `intent`. */
  confidence: z.number().int().min(0).max(100),
  /** Which classifier produced this, for auditability. */
  classifier: z.string().max(60),
  /** Keywords or signals the classifier matched on. */
  signals: z.array(z.string().max(80)).max(20),
});
export type Classification = z.infer<typeof classificationSchema>;

// ---------------------------------------------------------------------------
// Inbound message
// ---------------------------------------------------------------------------

export const inboundMessageSchema = z.object({
  /** Provider-native message id. Used for idempotency. */
  externalId: z.string().min(1).max(200),
  fromName: z.string().max(200),
  fromEmail: z.string().email().max(200),
  subject: z.string().max(500),
  body: z.string().max(20_000),
  receivedAt: isoDateTime,
});
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

// ---------------------------------------------------------------------------
// Activity — the human-in-the-loop unit of work
// ---------------------------------------------------------------------------

export const activityStatusSchema = z.enum([
  'pending',
  'approved',
  'dismissed',
  'failed',
]);
export type ActivityStatus = z.infer<typeof activityStatusSchema>;

export const draftEmailSchema = z.object({
  to: z.string().email().max(200),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20_000),
  attachments: z.array(z.string().max(200)).max(10),
});
export type DraftEmail = z.infer<typeof draftEmailSchema>;

export const activitySchema = z.object({
  id: idSchema,
  status: activityStatusSchema,
  message: inboundMessageSchema,
  classification: classificationSchema,
  /** Why the agent is proposing this. Rendered as a bulleted rationale. */
  rationale: z.array(z.string().max(300)).max(10),
  /** What will happen on approval, in order. */
  proposedActions: z.array(z.string().max(200)).max(10),
  /** The reply awaiting approval. Null for activities that send nothing. */
  draft: draftEmailSchema.nullable(),
  leadId: idSchema.nullable(),
  propertyId: idSchema.nullable(),
  createdAt: isoDateTime,
  resolvedAt: isoDateTime.nullable(),
  /** Set when status is 'failed'. */
  error: z.string().max(500).nullable(),
});
export type Activity = z.infer<typeof activitySchema>;

/** The only fields a human may edit before approving. */
export const modifyActivitySchema = z.object({
  draft: draftEmailSchema.partial(),
});
export type ModifyActivityInput = z.infer<typeof modifyActivitySchema>;

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const auditActionSchema = z.enum([
  'activity.created',
  'activity.approved',
  'activity.modified',
  'activity.dismissed',
  'activity.failed',
  'document.generated',
  'document.deleted',
  'lead.created',
  'lead.updated',
  'property.created',
  'property.updated',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntrySchema = z.object({
  id: idSchema,
  at: isoDateTime,
  /** 'user' for human decisions, 'system' for autonomous steps. */
  actor: z.enum(['user', 'system']),
  action: auditActionSchema,
  subjectType: z.enum(['activity', 'document', 'lead', 'property']),
  subjectId: idSchema,
  summary: z.string().max(500),
  /** Free-form JSON detail; for modifications this holds before/after. */
  detail: z.record(z.unknown()).nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documentKindSchema = z.enum(['cma', 'brochure', 'market_report']);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentSchema = z.object({
  id: idSchema,
  kind: documentKindSchema,
  filename: z.string().min(1).max(255),
  url: z.string().max(500),
  propertyId: idSchema.nullable(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: isoDateTime,
});
export type GeneratedDocument = z.infer<typeof documentSchema>;

export const comparableSchema = z.object({
  address: z.string().min(1).max(200),
  price: usdSchema,
  bedrooms: z.number().int().min(0).max(50),
  bathrooms: z.number().min(0).max(50),
  sqft: z.number().int().min(1).max(1_000_000),
  soldAt: isoDateTime.nullable(),
});
export type Comparable = z.infer<typeof comparableSchema>;

export const generateCmaSchema = z.object({
  propertyId: idSchema,
  comparables: z.array(comparableSchema).max(20).default([]),
});
export type GenerateCmaInput = z.infer<typeof generateCmaSchema>;

export const generateBrochureSchema = z.object({
  propertyId: idSchema,
});
export type GenerateBrochureInput = z.infer<typeof generateBrochureSchema>;

export const generateMarketReportSchema = z.object({
  area: z.string().min(1).max(120),
  trend: z.enum(['buyers_market', 'balanced', 'sellers_market']).default('balanced'),
  averageDaysOnMarket: z.number().int().min(0).max(3650),
  averagePrice: usdSchema,
  medianPrice: usdSchema,
  activeListings: z.number().int().min(0),
  monthsOfInventory: z.number().min(0).max(120),
});
export type GenerateMarketReportInput = z.infer<typeof generateMarketReportSchema>;

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

export const agentProfileSchema = z.object({
  name: z.string().min(1).max(120),
  brokerage: z.string().min(1).max(160),
  email: z.string().email().max(200),
  phone: z.string().max(40),
  license: z.string().max(60),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;
