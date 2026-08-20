import type { Activity } from '@reap/shared';
import { formatDate, formatTime } from '@reap/shared';
import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api.js';
import {
  useApproveActivity,
  useDismissActivity,
  useModifyActivity,
} from '../lib/queries.js';
import { INTENT_LABEL, INTENT_TONE, STATUS_LABEL, STATUS_TONE } from './intent.js';
import { RiskAlert } from './RiskAlert.js';
import { Badge, Button, Meter, cx } from './primitives.js';

/**
 * One inbound message, everything the system inferred from it, and the
 * decision the human owes it.
 *
 * Laid out as a document rather than a set of cards: original message, then the
 * machine's reasoning, then the draft, then the action bar pinned at the foot.
 * The reasoning sits above the draft deliberately, so the reviewer reads why
 * before reading what.
 */
export function CaseFile({ activity }: { activity: Activity }) {
  const { message, classification, draft } = activity;

  const approve = useApproveActivity();
  const dismiss = useDismissActivity();
  const modify = useModifyActivity();

  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? '');

  // The parent remounts on selection change, but an approval refetches into the
  // same instance; resync so the editor never shows a previous draft.
  useEffect(() => {
    setSubject(draft?.subject ?? '');
    setBody(draft?.body ?? '');
    setEditing(false);
  }, [draft?.subject, draft?.body]);

  const held = activity.status === 'held';
  const risk = activity.risk ?? [];
  // A held item offers no one-click actions. The agent must deal with the
  // finding first; dismissing is still available, approving is not.
  const pending = activity.status === 'pending' && !held;
  const busy = approve.isPending || dismiss.isPending || modify.isPending;
  const dirty = subject !== (draft?.subject ?? '') || body !== (draft?.body ?? '');

  const error = (approve.error ?? dismiss.error ?? modify.error) as ApiError | null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-8">
          <RiskAlert findings={risk} held={held} />

          {/* ---- Heading ---- */}
          <header className="animate-rise">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={INTENT_TONE[classification.intent]}>
                {INTENT_LABEL[classification.intent]}
              </Badge>
              <Badge tone={STATUS_TONE[activity.status]}>
                {STATUS_LABEL[activity.status]}
              </Badge>
            </div>

            <h1 className="mt-3 font-display text-[1.75rem] leading-tight font-semibold text-balance">
              {message.subject}
            </h1>

            <p className="mt-2 text-sm text-muted">
              {message.fromName}{' '}
              <span className="font-mono text-[0.8125rem]">
                &lt;{message.fromEmail}&gt;
              </span>
              {' · '}
              {formatDate(message.receivedAt)} at {formatTime(message.receivedAt)}
            </p>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-y border-rule py-2.5">
              <Meter value={classification.confidence} label="Confidence" />
              <Meter
                value={classification.sentiment}
                label="Sentiment"
                bands="sentiment"
              />
              <span className="ml-auto font-mono text-[0.6875rem] text-muted">
                {classification.classifier}
              </span>
            </div>
          </header>

          {/* ---- Original ---- */}
          <Section title="Original message" delay={60}>
            <blockquote className="border-l-2 border-rule-strong pl-4">
              <pre className="font-sans text-[0.875rem] leading-relaxed whitespace-pre-wrap text-ink-soft">
                {message.body}
              </pre>
            </blockquote>
          </Section>

          {/* ---- Reasoning ---- */}
          <Section title="Why this was proposed" delay={110}>
            <ol className="space-y-2">
              {activity.rationale.map((reason, index) => (
                <li key={index} className="flex gap-3 text-[0.875rem] leading-relaxed">
                  <span
                    data-numeric
                    className="mt-px shrink-0 font-mono text-[0.6875rem] text-muted"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-ink-soft">{reason}</span>
                </li>
              ))}
            </ol>

            {classification.signals.length > 0 ? (
              <p className="mt-4 text-xs text-muted">
                Matched on{' '}
                {classification.signals.map((signal, index) => (
                  <span key={signal}>
                    {index > 0 ? ', ' : ''}
                    <span className="font-mono text-ink-soft">“{signal}”</span>
                  </span>
                ))}
              </p>
            ) : null}
          </Section>

          {/* ---- Plan ---- */}
          <Section title="On approval" delay={150}>
            <ul className="space-y-1.5">
              {activity.proposedActions.map((action) => (
                <li key={action} className="flex gap-2.5 text-[0.875rem] text-ink-soft">
                  <span className="mt-[0.4rem] size-1 shrink-0 rounded-full bg-accent" />
                  {action}
                </li>
              ))}
            </ul>
          </Section>

          {/* ---- Draft ---- */}
          <Section
            title="Drafted reply"
            delay={190}
            aside={
              draft && pending ? (
                <button
                  onClick={() => setEditing((value) => !value)}
                  className="text-[0.6875rem] font-semibold text-accent hover:underline"
                >
                  {editing ? 'Done editing' : 'Edit'}
                </button>
              ) : null
            }
          >
            {!draft ? (
              <p className="border-l-2 border-caution bg-caution-soft px-4 py-3 text-[0.875rem] text-ink-soft">
                No reply was drafted. The classifier was not confident enough to propose
                wording, so this is filed for manual triage only.
              </p>
            ) : editing ? (
              <DraftEditor
                subject={subject}
                body={body}
                onSubject={setSubject}
                onBody={setBody}
              />
            ) : (
              <DraftPreview to={draft.to} subject={subject} body={body} />
            )}

            {draft && draft.attachments.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="label-eyebrow">Attach</span>
                {draft.attachments.map((name) => (
                  <span
                    key={name}
                    className="rounded-[2px] border border-rule-strong px-2 py-0.5 text-[0.6875rem] text-ink-soft"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </Section>

          {activity.error ? (
            <p className="mt-6 border-l-2 border-critical bg-critical-soft px-4 py-3 text-sm">
              Delivery failed: {activity.error}
            </p>
          ) : null}
        </div>
      </div>

      {/* ---- Decision bar ---- */}
      <footer className="shrink-0 border-t border-rule bg-surface px-8 py-4">
        {error?.isBlocked && error.findings?.length ? (
          <div
            role="alert"
            data-testid="draft-blocked"
            className="mb-3 rounded-lg border-2 border-red-300 bg-red-50/80 p-4 dark:border-red-900/60 dark:bg-red-950/30"
          >
            <p className="text-sm font-semibold">
              Not sent. This wording is a fair housing problem.
            </p>
            <ul className="mt-2 space-y-2">
              {error.findings.map((f) => (
                <li key={f.id + f.detail} className="text-sm">
                  <span className="font-medium">{f.detail}</span>
                  <br />
                  <span className="text-muted">{f.guidance}</span>
                  {f.citation ? (
                    <span className="ml-1 font-mono text-[0.6875rem] text-muted">
                      ({f.citation})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Edit the reply and try again. Nothing was sent.
            </p>
          </div>
        ) : error ? (
          <p role="alert" className="mb-3 text-sm text-critical">
            {error.isConflict
              ? 'This activity was already resolved. Refresh to see its current state.'
              : error.message}
          </p>
        ) : null}

        {pending ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto max-w-md text-xs leading-relaxed text-muted">
              {draft ? (
                <>
                  Approving sends this email to{' '}
                  <span className="font-mono text-ink-soft">{draft.to}</span>. Nothing
                  has been sent yet.
                </>
              ) : (
                'There is nothing to send. Dismiss once you have handled this manually.'
              )}
            </p>

            {dirty ? (
              <Button
                onClick={() =>
                  modify.mutate({ id: activity.id, draft: { subject, body } })
                }
                disabled={busy}
              >
                {modify.isPending ? 'Saving…' : 'Save edits'}
              </Button>
            ) : null}

            <Button
              tone="danger"
              onClick={() => dismiss.mutate({ id: activity.id })}
              disabled={busy}
            >
              Dismiss
            </Button>

            <Button
              tone="primary"
              onClick={() => approve.mutate(activity.id)}
              disabled={busy || !draft || dirty}
              title={dirty ? 'Save your edits before approving' : undefined}
            >
              {approve.isPending ? 'Sending…' : 'Approve and send'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">
            {STATUS_LABEL[activity.status]}
            {activity.resolvedAt
              ? ` · ${formatDate(activity.resolvedAt)} at ${formatTime(activity.resolvedAt)}`
              : null}
            . Resolved activities cannot be changed; the decision is recorded in the
            ledger.
          </p>
        )}
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
  aside,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  delay: number;
}) {
  return (
    <section className="animate-rise mt-8" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="label-eyebrow">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function DraftPreview({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}) {
  return (
    <article className="border border-rule bg-surface">
      <header className="space-y-0.5 border-b border-rule px-5 py-3">
        <FieldLine label="To" value={to} mono />
        <FieldLine label="Subject" value={subject} />
      </header>
      <pre className="px-5 py-4 font-sans text-[0.875rem] leading-relaxed whitespace-pre-wrap text-ink">
        {body}
      </pre>
    </article>
  );
}

function FieldLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <p className="flex gap-3 text-[0.8125rem]">
      <span className="w-14 shrink-0 text-muted">{label}</span>
      <span className={cx('min-w-0 flex-1 text-ink', mono && 'font-mono')}>
        {value}
      </span>
    </p>
  );
}

function DraftEditor({
  subject,
  body,
  onSubject,
  onBody,
}: {
  subject: string;
  body: string;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label-eyebrow">Subject</span>
        <input
          value={subject}
          onChange={(event) => onSubject(event.target.value)}
          className="mt-1 w-full border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="block">
        <span className="label-eyebrow">Body</span>
        <textarea
          value={body}
          onChange={(event) => onBody(event.target.value)}
          rows={16}
          className="mt-1 w-full resize-y border border-rule-strong bg-surface px-3 py-2 font-sans text-[0.875rem] leading-relaxed text-ink"
        />
      </label>
    </div>
  );
}
