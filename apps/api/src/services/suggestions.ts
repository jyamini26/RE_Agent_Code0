import type {
  AgentProfile,
  Classification,
  DraftEmail,
  InboundMessage,
  Intent,
  Lead,
  Property,
} from '@reap/shared';
import { formatPrice, formatSqft } from '@reap/shared';

export interface SuggestionContext {
  message: InboundMessage;
  classification: Classification;
  agent: AgentProfile;
  /** The matched lead, when the sender is already in the pipeline. */
  lead: Lead | null;
  /** The listing the message appears to be about, when one was matched. */
  property: Property | null;
}

export interface Suggestion {
  rationale: string[];
  proposedActions: string[];
  draft: DraftEmail | null;
}

interface Template {
  actions: (ctx: SuggestionContext) => string[];
  rationale: (ctx: SuggestionContext) => string[];
  /** Returning null means "surface for review but send nothing". */
  body: (ctx: SuggestionContext) => string | null;
  subject: (ctx: SuggestionContext) => string;
  attachments: (ctx: SuggestionContext) => string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0] ?? 'there';
}

function signature(agent: AgentProfile): string {
  return [agent.name, agent.brokerage, agent.phone, agent.license].join('\n');
}

function propertyLine(property: Property | null): string {
  if (!property) return 'the property';
  return `${property.address}, ${property.city}`;
}

function propertyFacts(property: Property | null): string {
  if (!property) return '';
  return [
    `\nQuick facts on ${property.address}:`,
    `  Price: ${formatPrice(property.price)}`,
    `  ${property.bedrooms} bed / ${property.bathrooms} bath / ${formatSqft(property.sqft)}`,
    property.yearBuilt ? `  Built: ${property.yearBuilt}` : null,
    property.features.length > 0
      ? `  Highlights: ${property.features.slice(0, 3).join(', ')}`
      : null,
    '',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function replySubject(message: InboundMessage): string {
  return message.subject.toLowerCase().startsWith('re:')
    ? message.subject
    : `Re: ${message.subject}`;
}

function leadContextRationale(lead: Lead | null): string[] {
  if (!lead)
    return ['Sender is not yet in the pipeline; approving will create a lead.'];
  return [
    `Existing ${lead.side} lead at the "${lead.stage}" stage, marked ${lead.temperature}.`,
  ];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * One template per intent.
 *
 * `satisfies Record<Intent, Template>` is the load-bearing part: adding a
 * member to the Intent union without adding a template here fails the build.
 * The predecessor to this file used a plain object literal and silently
 * produced `undefined` for any intent it had not anticipated.
 */
const TEMPLATES = {
  inquiry: {
    rationale: (ctx) => [
      'Sender is asking specific questions about a listing, which correlates with near-term showing intent.',
      'Replying with supporting documents attached shortens the question-and-answer cycle.',
      ...leadContextRationale(ctx.lead),
    ],
    actions: (ctx) => [
      'Send the drafted reply',
      ctx.property ? 'Attach the property brochure and CMA' : 'Attach the buyer guide',
      'Offer two concrete showing windows',
      'Log the exchange against the lead record',
    ],
    subject: (ctx) => replySubject(ctx.message),
    body: (ctx) =>
      `Hi ${firstName(ctx.message.fromName)},

Thanks for reaching out about ${propertyLine(ctx.property)}. Happy to answer everything you asked.
${propertyFacts(ctx.property)}
I have put together a brochure and a comparative market analysis so you can see how it is priced against recent nearby sales. Both are attached.

If it would help to walk it in person, I have time this Saturday morning or Sunday afternoon. Let me know which suits you and I will confirm.

Best,
${signature(ctx.agent)}`,
    attachments: (ctx) =>
      ctx.property
        ? ['Property brochure', 'Comparative market analysis']
        : ['Buyer guide'],
  },

  new_lead: {
    rationale: (ctx) => [
      'Message reads as a first-touch introduction from a prospective client.',
      'Response speed is the strongest predictor of conversion on a cold inbound lead.',
      ...leadContextRationale(ctx.lead),
    ],
    actions: () => [
      'Send the drafted welcome reply',
      'Create the lead at the "new" stage',
      'Attach the buyer or seller guide',
      'Schedule a 15-minute intro call',
    ],
    subject: () => 'Great to hear from you',
    body: (ctx) =>
      `Hi ${firstName(ctx.message.fromName)},

Thanks for getting in touch. I would be glad to help.

So I can point you at the right places instead of everything on the market, it would help to know three things: the areas you are focused on, the timeline you are working with, and the budget you have in mind.

If it is easier to talk it through, I have 15 minutes free most weekday mornings. Reply with a time that works and I will send an invitation.

Best,
${signature(ctx.agent)}`,
    attachments: () => ['Buyer guide', 'Current market snapshot'],
  },

  showing_request: {
    rationale: (ctx) => [
      'Sender explicitly asked to see a property, the highest-intent signal in the inbox.',
      'Confirming a specific time in the first reply avoids a scheduling back-and-forth.',
      ...leadContextRationale(ctx.lead),
    ],
    actions: (ctx) => [
      'Send the drafted reply with two proposed times',
      'Hold the slot on the calendar pending confirmation',
      ctx.lead
        ? 'Advance the lead to the "showing" stage'
        : 'Create the lead at the "showing" stage',
      'Attach directions and access notes',
    ],
    subject: (ctx) => `Showing ${propertyLine(ctx.property)}`,
    body: (ctx) =>
      `Hi ${firstName(ctx.message.fromName)},

Absolutely, I would be glad to show you ${propertyLine(ctx.property)}.

Two windows that work on my side:
  Saturday, 10:00am to 12:00pm
  Sunday, 2:00pm to 4:00pm

Tell me which one you prefer and I will confirm access and send directions. If neither works, give me a couple of times that do and I will make one of them happen.

Best,
${signature(ctx.agent)}`,
    attachments: () => ['Directions and parking notes'],
  },

  offer: {
    rationale: (ctx) => [
      'Message concerns offer or contract terms, which carry legal and fiduciary weight.',
      'Draft deliberately acknowledges receipt without confirming or negotiating any term.',
      ...leadContextRationale(ctx.lead),
    ],
    actions: () => [
      'Send the drafted acknowledgement',
      'Review the full terms before responding substantively',
      'Advance the lead to the "offer" stage',
      'Flag for broker review',
    ],
    subject: (ctx) => replySubject(ctx.message),
    body: (ctx) =>
      `Hi ${firstName(ctx.message.fromName)},

Thank you for sending this through. I have received it and I am reviewing the terms now.

I will come back to you with a considered response rather than a quick one, since the details matter here. You will hear from me within one business day.

If anything is time-sensitive on your end, call me directly at ${ctx.agent.phone}.

Best,
${signature(ctx.agent)}`,
    attachments: () => [],
  },

  issue: {
    rationale: (ctx) => [
      'Negative sentiment and urgency markers detected; this is a relationship or deal risk.',
      'Draft commits to a call rather than resolving in writing, which de-escalates faster.',
      'Recommend reading the original message in full before approving.',
      ...leadContextRationale(ctx.lead),
    ],
    actions: () => [
      'Read the original message before approving',
      'Send the drafted acknowledgement',
      'Call the sender within two hours',
      'Notify the broker if the matter is contractual',
    ],
    subject: (ctx) => replySubject(ctx.message),
    body: (ctx) =>
      `Hi ${firstName(ctx.message.fromName)},

I read your message and I want to deal with this properly rather than trade emails about it.

I am free to call you today. Let me know a window that works and I will ring you then, or call me directly at ${ctx.agent.phone} whenever suits.

Either way I will come back to you today.

Best,
${signature(ctx.agent)}`,
    attachments: () => [],
  },

  follow_up: {
    rationale: (ctx) => [
      'Sender is chasing a status update, which means an earlier commitment is outstanding.',
      'A specific next date is more reassuring than a general acknowledgement.',
      ...leadContextRationale(ctx.lead),
    ],
    actions: (ctx) => [
      'Send the drafted status update',
      ctx.property
        ? 'Attach the latest activity summary for the listing'
        : 'Attach the latest market update',
      'Set a reminder to follow up again in three days',
      'Refresh the last-contact date on the lead',
    ],
    subject: (ctx) => replySubject(ctx.message),
    body: (ctx) =>
      `Hi ${firstName(ctx.message.fromName)},

Thanks for checking in, and apologies for leaving you waiting.

Here is where things stand${ctx.property ? ` on ${propertyLine(ctx.property)}` : ''}: I am gathering the latest numbers and will have a full update to you by the end of the week.

If anything shifts before then I will tell you straight away rather than waiting for the update.

Best,
${signature(ctx.agent)}`,
    attachments: (ctx) =>
      ctx.property ? ['Listing activity summary'] : ['Market update'],
  },

  unknown: {
    rationale: () => [
      'The classifier could not identify a confident intent for this message.',
      'No reply has been drafted; this is surfaced for manual triage only.',
    ],
    actions: () => [
      'Read the message and categorise it manually',
      'Dismiss if it is not client correspondence',
    ],
    subject: (ctx) => replySubject(ctx.message),
    // Returning null is the point: the system declines to guess at a reply.
    body: () => null,
    attachments: () => [],
  },
} as const satisfies Record<Intent, Template>;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Below this confidence, even a matched intent is not trusted to draft a reply. */
export const MIN_CONFIDENCE_TO_DRAFT = 40;

/**
 * Builds the proposal a human will approve, modify, or dismiss.
 *
 * Nothing here sends anything. The engine's only job is to produce a draft plus
 * the reasoning behind it, so the reviewer can judge the suggestion rather than
 * just accept it.
 */
export function buildSuggestion(ctx: SuggestionContext): Suggestion {
  const template = TEMPLATES[ctx.classification.intent];

  const rationale = template.rationale(ctx);
  const proposedActions = template.actions(ctx);
  const body = template.body(ctx);

  const lowConfidence = ctx.classification.confidence < MIN_CONFIDENCE_TO_DRAFT;

  if (body === null || lowConfidence) {
    return {
      rationale: lowConfidence
        ? [
            `Confidence ${ctx.classification.confidence}% is below the ${MIN_CONFIDENCE_TO_DRAFT}% threshold to draft a reply.`,
            ...rationale,
          ]
        : rationale,
      proposedActions,
      draft: null,
    };
  }

  return {
    rationale,
    proposedActions,
    draft: {
      to: ctx.message.fromEmail,
      subject: template.subject(ctx),
      body,
      attachments: template.attachments(ctx),
    },
  };
}
