import type { InboundMessage } from '@reap/shared';
import { INTENTS } from '@reap/shared';
import { describe, expect, it } from 'vitest';
import { RulesClassifier } from './rules.js';

const classifier = new RulesClassifier();

function message(subject: string, body: string): InboundMessage {
  return {
    externalId: 'test-1',
    fromName: 'Test Sender',
    fromEmail: 'sender@example.com',
    subject,
    body,
    receivedAt: '2026-07-29T12:00:00.000Z',
  };
}

describe('RulesClassifier', () => {
  it('always returns a member of the Intent union', async () => {
    const result = await classifier.classify(message('hello', 'anything at all'));
    expect(INTENTS).toContain(result.intent);
  });

  it.each([
    ['inquiry', 'Question about the listing', 'What is the price and square footage?'],
    ['new_lead', 'Hello', 'We are relocating and looking for an agent. Pre-approved.'],
    ['showing_request', 'Viewing', 'Can we tour the property this weekend?'],
    ['offer', 'Offer', 'We would like to make an offer, earnest money is ready.'],
    ['issue', 'Urgent', 'This is a problem and frankly unacceptable, I am frustrated.'],
    ['follow_up', 'Hi', 'Just checking in, any update on the status?'],
  ] as const)('classifies %s', async (expected, subject, body) => {
    const result = await classifier.classify(message(subject, body));
    expect(result.intent).toBe(expected);
  });

  it('falls back to unknown with low confidence when nothing matches', async () => {
    const result = await classifier.classify(
      message('Your badge is ready', 'Present this at the desk. Reference 8842.'),
    );

    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBeLessThan(40);
    expect(result.signals).toEqual([]);
  });

  it('prefers issue when urgency competes with another intent', async () => {
    // Priority ordering is what stops an angry email about an offer from being
    // filed as routine offer correspondence.
    const result = await classifier.classify(
      message('Offer problem', 'There is an urgent problem with the offer.'),
    );

    expect(result.intent).toBe('issue');
  });

  it('is case-insensitive', async () => {
    const lower = await classifier.classify(message('showing', 'can we tour it?'));
    const upper = await classifier.classify(message('SHOWING', 'CAN WE TOUR IT?'));

    expect(upper.intent).toBe(lower.intent);
  });

  it('raises confidence as corroborating keywords accumulate', async () => {
    const weak = await classifier.classify(message('Hi', 'I have a question.'));
    const strong = await classifier.classify(
      message('Hi', 'I have a question about the price, the HOA, and the taxes.'),
    );

    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });

  it('never claims certainty', async () => {
    const result = await classifier.classify(
      message(
        'Question price hoa taxes schools parking',
        'question curious interested how much what is the price square footage hoa taxes schools parking can you tell me',
      ),
    );

    expect(result.confidence).toBeLessThanOrEqual(92);
  });

  it('lowers sentiment when negative markers are present', async () => {
    const neutral = await classifier.classify(
      message('Checking in', 'Any update on the status?'),
    );
    const sour = await classifier.classify(
      message('Checking in', 'Any update? I never heard back and I am not happy.'),
    );

    expect(sour.sentiment).toBeLessThan(neutral.sentiment);
  });

  it('keeps sentiment and confidence inside 0-100', async () => {
    const result = await classifier.classify(
      message(
        'Terrible',
        'not happy no longer waste rude ignored worst never heard back problem urgent complaint',
      ),
    );

    expect(result.sentiment).toBeGreaterThanOrEqual(0);
    expect(result.sentiment).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('records the signals it matched', async () => {
    const result = await classifier.classify(
      message('Tour request', 'Could we schedule a showing?'),
    );

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.classifier).toBe('rules-v1');
  });
});
