import type { RiskFinding } from '@reap/shared';

/**
 * The interruption.
 *
 * Everything else in this interface is designed to help an agent move quickly.
 * This component exists to do the opposite. When a guard finds something, the
 * point is to break the rhythm of clicking through a queue, because the
 * failure mode being prevented, wiring a client's money to a stranger, happens
 * precisely when someone is moving fast and the message looks routine.
 *
 * So it is loud, it sits above the content rather than beside it, and it
 * states the required action as an instruction rather than a suggestion.
 */

const LEVEL_STYLE: Record<
  RiskFinding['level'],
  { box: string; chip: string; label: string }
> = {
  critical: {
    box: 'border-red-300 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/30',
    chip: 'bg-red-600 text-white',
    label: 'Critical',
  },
  elevated: {
    box: 'border-amber-300 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30',
    chip: 'bg-amber-600 text-white',
    label: 'Elevated',
  },
  advisory: {
    box: 'border-sky-300 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/25',
    chip: 'bg-sky-600 text-white',
    label: 'Advisory',
  },
};

export function RiskAlert({
  findings,
  held,
}: {
  findings: RiskFinding[];
  held: boolean;
}) {
  const [first] = findings;
  if (!first) return null;

  const worst: RiskFinding['level'] = findings.some((f) => f.level === 'critical')
    ? 'critical'
    : findings.some((f) => f.level === 'elevated')
      ? 'elevated'
      : 'advisory';

  const style = LEVEL_STYLE[worst];

  return (
    <section
      className={`animate-rise mb-6 rounded-lg border-2 p-5 ${style.box}`}
      role="alert"
      aria-live="assertive"
      data-testid="risk-alert"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase ${style.chip}`}
        >
          {style.label}
        </span>
        {held && (
          <span className="rounded bg-ink px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-paper uppercase">
            Held — not actionable
          </span>
        )}
      </div>

      <h2 className="mt-3 font-display text-lg leading-tight font-semibold">
        {first.title}
      </h2>

      {held && (
        <p className="mt-1 text-sm font-medium">
          This has been kept out of your queue. Do not act on it, forward it, or send it
          to a client until the step below is completed.
        </p>
      )}

      <ul className="mt-4 space-y-4">
        {findings.map((f) => (
          <li key={f.id + f.detail} className="border-l-2 border-current/25 pl-3">
            <p className="text-sm">{f.detail}</p>
            <p className="mt-1.5 text-sm font-semibold">{f.guidance}</p>
            <p className="mt-1 font-mono text-[0.6875rem] text-muted">
              {f.source}
              {f.citation ? ` · ${f.citation}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
