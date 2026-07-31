import type { Lead, LeadStage } from '@reap/shared';
import {
  LEAD_STAGES,
  formatPriceCompact,
  formatRelativeTime,
  titleCase,
} from '@reap/shared';
import { Badge, ErrorNote, Skeleton, cx } from '../components/primitives.js';
import { useLeads, usePipelineSummary, useUpdateLead } from '../lib/queries.js';

const TEMPERATURE_TONE = {
  hot: 'critical',
  warm: 'caution',
  cold: 'neutral',
} as const;

export function Pipeline() {
  const leads = useLeads();
  const summary = usePipelineSummary();
  const update = useUpdateLead();

  if (leads.isError) {
    return <ErrorNote message={(leads.error as Error).message} />;
  }

  const byStage = new Map<LeadStage, Lead[]>(LEAD_STAGES.map((stage) => [stage, []]));
  for (const lead of leads.data?.data ?? []) {
    byStage.get(lead.stage)?.push(lead);
  }

  const totals = new Map(
    (summary.data?.stages ?? []).map((entry) => [entry.stage, entry]),
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-rule bg-surface px-6 py-3">
        <h1 className="label-eyebrow">Pipeline</h1>
        <p className="text-xs text-muted">
          {summary.data?.totalLeads ?? 0} leads · move a card with the arrows
        </p>
      </header>

      {leads.isPending ? (
        <Skeleton rows={6} />
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto">
          {/* Columns carry their own divider so the track's background does
              not show as dead colour to the right of the last stage. */}
          <div className="flex h-full min-w-max bg-paper">
            {LEAD_STAGES.map((stage) => {
              const items = byStage.get(stage) ?? [];
              const total = totals.get(stage);

              return (
                <section
                  key={stage}
                  className="flex h-full w-[248px] min-w-0 flex-col border-r border-rule bg-paper"
                >
                  <header className="sticky top-0 border-b border-rule bg-surface px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-[0.8125rem] font-semibold text-ink">
                        {titleCase(stage)}
                      </h2>
                      <span
                        data-numeric
                        className="font-mono text-[0.6875rem] text-muted"
                      >
                        {items.length}
                      </span>
                    </div>
                    {total && total.valueUsd > 0 ? (
                      <p
                        data-numeric
                        className="mt-0.5 font-mono text-[0.6875rem] text-muted"
                      >
                        {formatPriceCompact(total.valueUsd)}
                      </p>
                    ) : null}
                  </header>

                  <div className="min-h-0 flex-1 space-y-px overflow-y-auto">
                    {items.map((lead, index) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        index={index}
                        busy={update.isPending}
                        onMove={(next) => update.mutate({ id: lead.id, stage: next })}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  index,
  busy,
  onMove,
}: {
  lead: Lead;
  index: number;
  busy: boolean;
  onMove: (stage: LeadStage) => void;
}) {
  const position = LEAD_STAGES.indexOf(lead.stage);
  const previous = position > 0 ? LEAD_STAGES[position - 1] : undefined;
  const next =
    position < LEAD_STAGES.length - 1 ? LEAD_STAGES[position + 1] : undefined;

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 6) * 30}ms` }}
      className="animate-rise group border-b border-rule bg-surface px-4 py-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-[0.8125rem] font-semibold text-ink">
          {lead.name}
        </h3>
        <Badge tone={TEMPERATURE_TONE[lead.temperature]}>{lead.temperature}</Badge>
      </div>

      <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted">
        {lead.email}
      </p>

      <dl className="mt-2 space-y-0.5 text-[0.6875rem] text-muted">
        <div className="flex justify-between gap-2">
          <dt>Side</dt>
          <dd className="text-ink-soft">{titleCase(lead.side)}</dd>
        </div>
        {lead.budgetMax ? (
          <div className="flex justify-between gap-2">
            <dt>Budget</dt>
            <dd data-numeric className="font-mono text-ink-soft">
              {lead.budgetMin ? `${formatPriceCompact(lead.budgetMin)}–` : 'up to '}
              {formatPriceCompact(lead.budgetMax)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt>Contact</dt>
          <dd className="text-ink-soft">{formatRelativeTime(lead.lastContactAt)}</dd>
        </div>
      </dl>

      {/* Controls stay hidden until hover or keyboard focus so the board reads
          as data first and an editor second. */}
      <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <MoveButton
          direction="back"
          target={previous}
          disabled={busy}
          onMove={onMove}
        />
        <MoveButton direction="forward" target={next} disabled={busy} onMove={onMove} />
      </div>
    </article>
  );
}

function MoveButton({
  direction,
  target,
  disabled,
  onMove,
}: {
  direction: 'back' | 'forward';
  target: LeadStage | undefined;
  disabled: boolean;
  onMove: (stage: LeadStage) => void;
}) {
  if (!target) return <span className="w-full" />;

  return (
    <button
      onClick={() => onMove(target)}
      disabled={disabled}
      aria-label={`Move to ${titleCase(target)}`}
      title={`Move to ${titleCase(target)}`}
      className={cx(
        'flex-1 rounded-[2px] border border-rule-strong py-0.5',
        'text-[0.625rem] text-muted transition-colors',
        'hover:bg-surface-sunk hover:text-ink disabled:opacity-40',
      )}
    >
      {direction === 'back' ? '←' : '→'} {titleCase(target)}
    </button>
  );
}
