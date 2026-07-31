import type {
  AgentProfile,
  Classification,
  InboundMessage,
  Intent,
  Lead,
  Property,
} from '@reap/shared';
import { INTENTS } from '@reap/shared';
import { describe, expect, it } from 'vitest';
import { MIN_CONFIDENCE_TO_DRAFT, buildSuggestion } from './suggestions.js';

const agent: AgentProfile = {
  name: 'Jordan Reyes',
  brokerage: 'Meridian Residential',
  email: 'jordan@meridian.example',
  phone: '(555) 010-0142',
  license: 'DRE #01234567',
};

const message: InboundMessage = {
  externalId: 'm-1',
  fromName: 'Daniel Okafor',
  fromEmail: 'daniel.okafor@example.com',
  subject: 'Questions about 418 Aldergrove Lane',
  body: 'What are the HOA dues?',
  receivedAt: '2026-07-29T12:00:00.000Z',
};

const property: Property = {
  id: 'prop_1',
  address: '418 Aldergrove Lane',
  city: 'Fairhaven',
  neighborhood: 'Aldergrove',
  price: 845_000,
  bedrooms: 4,
  bathrooms: 3,
  sqft: 2_940,
  lotSizeSqft: 8_200,
  yearBuilt: 2016,
  propertyType: 'single_family',
  status: 'listed',
  listedAt: '2026-07-17T00:00:00.000Z',
  description: null,
  features: ['Finished lower level', 'Two-car garage', 'West-facing garden'],
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
};

const lead: Lead = {
  id: 'lead_1',
  name: 'Daniel Okafor',
  email: 'daniel.okafor@example.com',
  phone: null,
  side: 'buyer',
  stage: 'qualified',
  temperature: 'hot',
  source: null,
  propertyId: 'prop_1',
  budgetMin: null,
  budgetMax: null,
  notes: null,
  lastContactAt: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
};

function classification(intent: Intent, confidence = 90): Classification {
  return {
    intent,
    sentiment: 70,
    confidence,
    classifier: 'test',
    signals: [],
  };
}

describe('buildSuggestion', () => {
  /**
   * The regression this whole module exists to prevent: the predecessor keyed
   * templates off a plain object literal and returned `undefined` for any
   * intent it had not anticipated, which crashed on the first FOLLOW_UP email.
   */
  it('handles every intent in the union without throwing', () => {
    for (const intent of INTENTS) {
      const suggestion = buildSuggestion({
        message,
        classification: classification(intent),
        agent,
        lead: null,
        property: null,
      });

      expect(suggestion.rationale.length).toBeGreaterThan(0);
      expect(suggestion.proposedActions.length).toBeGreaterThan(0);
    }
  });

  it('drafts a reply for a confident, actionable intent', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('inquiry'),
      agent,
      lead,
      property,
    });

    expect(suggestion.draft).not.toBeNull();
    expect(suggestion.draft?.to).toBe(message.fromEmail);
    expect(suggestion.draft?.subject).toBe('Re: Questions about 418 Aldergrove Lane');
  });

  it('addresses the sender by first name only', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('inquiry'),
      agent,
      lead,
      property,
    });

    expect(suggestion.draft?.body).toContain('Hi Daniel,');
    expect(suggestion.draft?.body).not.toContain('Hi Daniel Okafor,');
  });

  it('signs with the configured agent, never a hard-coded name', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('inquiry'),
      agent,
      lead,
      property,
    });

    expect(suggestion.draft?.body).toContain(agent.name);
    expect(suggestion.draft?.body).toContain(agent.brokerage);
    expect(suggestion.draft?.body).toContain(agent.license);
  });

  it('includes property facts when a listing was matched', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('inquiry'),
      agent,
      lead,
      property,
    });

    expect(suggestion.draft?.body).toContain('418 Aldergrove Lane');
    expect(suggestion.draft?.body).toContain('$845,000');
  });

  it('avoids naming a listing it could not match', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('inquiry'),
      agent,
      lead: null,
      property: null,
    });

    expect(suggestion.draft?.body).toContain('the property');
    expect(suggestion.draft?.body).not.toContain('418 Aldergrove Lane');
  });

  it('declines to draft for an unknown intent', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('unknown', 90),
      agent,
      lead: null,
      property: null,
    });

    expect(suggestion.draft).toBeNull();
  });

  it('declines to draft below the confidence threshold', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('inquiry', MIN_CONFIDENCE_TO_DRAFT - 1),
      agent,
      lead,
      property,
    });

    expect(suggestion.draft).toBeNull();
    expect(suggestion.rationale[0]).toMatch(/below the .* threshold/);
  });

  it('drafts exactly at the threshold', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('inquiry', MIN_CONFIDENCE_TO_DRAFT),
      agent,
      lead,
      property,
    });

    expect(suggestion.draft).not.toBeNull();
  });

  it('never commits to terms when acknowledging an offer', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('offer'),
      agent,
      lead,
      property,
    });

    const body = suggestion.draft?.body.toLowerCase() ?? '';
    expect(body).toContain('reviewing');
    expect(body).not.toContain('we accept');
  });

  it('notes when the sender is not yet a lead', () => {
    const suggestion = buildSuggestion({
      message,
      classification: classification('new_lead'),
      agent,
      lead: null,
      property: null,
    });

    expect(suggestion.rationale.join(' ')).toMatch(/not yet in the pipeline/);
  });
});
