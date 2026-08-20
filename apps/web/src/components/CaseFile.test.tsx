import type { Activity } from '@reap/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaseFile } from './CaseFile.js';

const baseActivity: Activity = {
  id: 'act_1',
  status: 'pending',
  message: {
    externalId: 'sim-1',
    fromName: 'Daniel Okafor',
    fromEmail: 'daniel.okafor@example.com',
    subject: 'Questions about 418 Aldergrove Lane',
    body: 'What are the HOA dues?',
    receivedAt: '2026-07-29T12:00:00.000Z',
  },
  classification: {
    intent: 'inquiry',
    sentiment: 75,
    confidence: 92,
    classifier: 'rules-v1',
    signals: ['hoa', 'question'],
  },
  rationale: ['Sender is asking specific questions about a listing.'],
  proposedActions: ['Send the drafted reply'],
  draft: {
    to: 'daniel.okafor@example.com',
    subject: 'Re: Questions about 418 Aldergrove Lane',
    body: 'Hi Daniel,\n\nHappy to answer those.',
    attachments: ['Property brochure'],
  },
  leadId: 'lead_1',
  propertyId: 'prop_1',
  createdAt: '2026-07-29T12:01:00.000Z',
  resolvedAt: null,
  error: null,
  risk: [],
};

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  // Every mutation in this component goes through fetch; a resolved stub keeps
  // the tests focused on rendering and gating rather than on the network.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ data: baseActivity }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CaseFile', () => {
  it('shows the reasoning before the draft', () => {
    renderWithClient(<CaseFile activity={baseActivity} />);

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((node) => node.textContent);

    expect(headings.indexOf('Why this was proposed')).toBeLessThan(
      headings.indexOf('Drafted reply'),
    );
  });

  it('states plainly that approving will send an email', () => {
    renderWithClient(<CaseFile activity={baseActivity} />);

    expect(screen.getByText(/Nothing has been sent yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve and send/ })).toBeEnabled();
  });

  it('surfaces the classifier signals', () => {
    renderWithClient(<CaseFile activity={baseActivity} />);
    expect(screen.getByText(/Matched on/)).toBeInTheDocument();
  });

  it('exposes confidence and sentiment as accessible meters', () => {
    renderWithClient(<CaseFile activity={baseActivity} />);

    expect(screen.getByRole('meter', { name: 'Confidence' })).toHaveAttribute(
      'aria-valuenow',
      '92',
    );
    expect(screen.getByRole('meter', { name: 'Sentiment' })).toHaveAttribute(
      'aria-valuenow',
      '75',
    );
  });

  it('cannot be approved when there is no draft', () => {
    renderWithClient(<CaseFile activity={{ ...baseActivity, draft: null }} />);

    expect(screen.getByRole('button', { name: /Approve and send/ })).toBeDisabled();
    expect(screen.getByText(/No reply was drafted/)).toBeInTheDocument();
  });

  /**
   * The gate that matters: an edited draft must be saved before it can be
   * sent, so the text in the audit trail is the text that actually went out.
   */
  it('blocks approval while the draft has unsaved edits', async () => {
    const user = userEvent.setup();
    renderWithClient(<CaseFile activity={baseActivity} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const body = screen.getByLabelText('Body');
    await user.clear(body);
    await user.type(body, 'My own wording.');

    expect(screen.getByRole('button', { name: /Approve and send/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save edits/ })).toBeInTheDocument();
  });

  it('offers no decision controls once resolved', () => {
    renderWithClient(
      <CaseFile
        activity={{
          ...baseActivity,
          status: 'approved',
          resolvedAt: '2026-07-29T12:05:00.000Z',
        }}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Approve and send/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be changed/)).toBeInTheDocument();
  });

  it('reports a delivery failure on the activity', () => {
    renderWithClient(
      <CaseFile
        activity={{
          ...baseActivity,
          status: 'failed',
          error: 'SMTP connection refused',
        }}
      />,
    );

    expect(screen.getByText(/SMTP connection refused/)).toBeInTheDocument();
  });
});
