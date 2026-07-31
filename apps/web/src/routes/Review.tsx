import type { Activity, ActivityStatus } from '@reap/shared';
import { formatRelativeTime } from '@reap/shared';
import { useEffect, useState } from 'react';
import { CaseFile } from '../components/CaseFile.js';
import { INTENT_LABEL, INTENT_TONE } from '../components/intent.js';
import {
  Badge,
  EmptyState,
  ErrorNote,
  Pane,
  Skeleton,
  cx,
} from '../components/primitives.js';
import { useActivities } from '../lib/queries.js';

const FILTERS: Array<{ value: ActivityStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

export function Review() {
  const [filter, setFilter] = useState<ActivityStatus | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useActivities(filter === 'all' ? undefined : filter);
  const activities = query.data?.data ?? [];

  const selected = activities.find((a) => a.id === selectedId) ?? null;

  // Keep a selection alive as the list changes. Approving the open item removes
  // it from the pending list, and landing on an empty pane every time would
  // make working through a queue tedious.
  useEffect(() => {
    if (activities.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!activities.some((a) => a.id === selectedId)) {
      setSelectedId(activities[0]?.id ?? null);
    }
  }, [activities, selectedId]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(300px,380px)_1fr]">
      <Pane
        title={`Queue · ${activities.length}`}
        className="border-r"
        aside={
          <div className="flex gap-0.5" role="tablist" aria-label="Filter by status">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                role="tab"
                aria-selected={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cx(
                  'rounded-[2px] px-2 py-1 text-[0.6875rem] font-semibold transition-colors',
                  filter === option.value
                    ? 'bg-ink text-paper'
                    : 'text-muted hover:bg-surface-sunk hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {query.isPending ? <Skeleton rows={5} /> : null}
        {query.isError ? <ErrorNote message={(query.error as Error).message} /> : null}
        {query.isSuccess && activities.length === 0 ? (
          <EmptyState
            title="Nothing here"
            detail={
              filter === 'pending'
                ? 'Every message has been reviewed. New mail appears after the next inbox check.'
                : `No ${filter} activities yet.`
            }
          />
        ) : null}

        <ul className="divide-y divide-rule">
          {activities.map((activity, index) => (
            <QueueRow
              key={activity.id}
              activity={activity}
              index={index}
              selected={activity.id === selectedId}
              onSelect={() => setSelectedId(activity.id)}
            />
          ))}
        </ul>
      </Pane>

      {selected ? (
        <CaseFile key={selected.id} activity={selected} />
      ) : (
        <div className="flex h-full items-center justify-center bg-paper">
          <EmptyState
            title="Select a message"
            detail="Each item is a drafted response awaiting your decision. Nothing is sent until you approve it."
          />
        </div>
      )}
    </div>
  );
}

function QueueRow({
  activity,
  index,
  selected,
  onSelect,
}: {
  activity: Activity;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { classification: c, message } = activity;

  return (
    <li>
      <button
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        // Staggered entry, capped so a long queue does not crawl in.
        style={{ animationDelay: `${Math.min(index, 8) * 26}ms` }}
        className={cx(
          'animate-rise relative block w-full px-5 py-3.5 text-left transition-colors',
          selected ? 'bg-surface-sunk' : 'hover:bg-surface-sunk/60',
        )}
      >
        <span
          className={cx(
            'absolute inset-y-0 left-0 w-[2px] transition-colors',
            selected ? 'bg-accent' : 'bg-transparent',
          )}
        />

        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold text-ink">
            {message.fromName}
          </span>
          <span className="shrink-0 font-mono text-[0.625rem] text-muted">
            {formatRelativeTime(message.receivedAt)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-[0.8125rem] text-ink-soft">
          {message.subject}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <Badge tone={INTENT_TONE[c.intent]}>{INTENT_LABEL[c.intent]}</Badge>
          {activity.draft === null ? (
            <span className="text-[0.6875rem] text-muted">no draft</span>
          ) : null}
          <span data-numeric className="ml-auto font-mono text-[0.625rem] text-muted">
            {c.confidence}%
          </span>
        </div>
      </button>
    </li>
  );
}
