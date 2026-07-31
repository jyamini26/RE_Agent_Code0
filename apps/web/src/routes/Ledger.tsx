import type { AuditEntry } from '@reap/shared';
import { formatDateShort, formatTime } from '@reap/shared';
import { useState } from 'react';
import {
  Badge,
  EmptyState,
  ErrorNote,
  Skeleton,
  cx,
} from '../components/primitives.js';
import { useAudit } from '../lib/queries.js';

const ACTOR_TONE = { user: 'accent', system: 'neutral' } as const;

/**
 * The append-only record.
 *
 * Presented as a ledger rather than an activity feed: monospace timestamps, a
 * single column, and no controls, because the point of the view is that
 * nothing here can be edited.
 */
export function Ledger() {
  const audit = useAudit();
  const [expanded, setExpanded] = useState<string | null>(null);

  const entries = audit.data?.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-rule bg-surface px-6 py-3">
        <h1 className="label-eyebrow">Ledger</h1>
        <p className="text-xs text-muted">
          {audit.data?.meta.total ?? 0} entries · append-only
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {audit.isPending ? <Skeleton rows={8} /> : null}
        {audit.isError ? <ErrorNote message={(audit.error as Error).message} /> : null}
        {audit.isSuccess && entries.length === 0 ? (
          <EmptyState
            title="No entries yet"
            detail="Every classification, edit, approval, and dismissal is recorded here as it happens."
          />
        ) : null}

        <ol className="mx-auto max-w-4xl px-6 py-4">
          {entries.map((entry, index) => (
            <LedgerRow
              key={entry.id}
              entry={entry}
              index={index}
              expanded={expanded === entry.id}
              onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function LedgerRow({
  entry,
  index,
  expanded,
  onToggle,
}: {
  entry: AuditEntry;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetail = entry.detail !== null && Object.keys(entry.detail).length > 0;

  return (
    <li
      style={{ animationDelay: `${Math.min(index, 10) * 22}ms` }}
      className="animate-rise border-b border-rule"
    >
      <button
        onClick={onToggle}
        disabled={!hasDetail}
        className={cx(
          'flex w-full items-baseline gap-4 py-3 text-left',
          hasDetail && 'hover:bg-surface-sunk/50',
          !hasDetail && 'cursor-default',
        )}
      >
        <time
          dateTime={entry.at}
          data-numeric
          className="w-36 shrink-0 font-mono text-[0.6875rem] text-muted"
        >
          {formatTime(entry.at)}
          <span className="ml-2 opacity-70">{formatDateShort(entry.at)}</span>
        </time>

        <Badge tone={ACTOR_TONE[entry.actor]}>{entry.actor}</Badge>

        <span className="min-w-0 flex-1 text-[0.875rem] text-ink-soft">
          {entry.summary}
        </span>

        <code className="hidden shrink-0 font-mono text-[0.625rem] text-muted lg:inline">
          {entry.action}
        </code>

        {hasDetail ? (
          <span
            aria-hidden
            className={cx(
              'shrink-0 text-[0.625rem] text-muted transition-transform',
              expanded && 'rotate-90',
            )}
          >
            ▸
          </span>
        ) : (
          <span className="w-2 shrink-0" />
        )}
      </button>

      {expanded && entry.detail ? (
        <pre className="animate-fade mb-3 overflow-x-auto border-l-2 border-rule-strong bg-surface-sunk px-4 py-3 font-mono text-[0.6875rem] leading-relaxed text-ink-soft">
          {JSON.stringify(entry.detail, null, 2)}
        </pre>
      ) : null}
    </li>
  );
}
