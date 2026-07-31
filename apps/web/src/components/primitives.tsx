import type { ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export function Pane({
  title,
  aside,
  children,
  className,
  scroll = true,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <section className={cx('flex min-h-0 flex-col border-rule bg-surface', className)}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 className="label-eyebrow">{title}</h2>
        {aside}
      </header>
      <div className={cx('min-h-0 flex-1', scroll && 'overflow-y-auto')}>
        {children}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <p className="font-display text-lg text-ink-soft">{title}</p>
      {detail ? (
        <p className="max-w-sm text-sm leading-relaxed text-muted">{detail}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Repeated hairline blocks used while a pane's data is in flight. */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-fade divide-y divide-rule">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2 px-5 py-4">
          <div className="h-2.5 w-1/3 rounded-full bg-surface-sunk" />
          <div className="h-2.5 w-4/5 rounded-full bg-surface-sunk" />
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="m-5 border-l-2 border-critical bg-critical-soft px-4 py-3 text-sm text-ink"
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonTone = 'primary' | 'quiet' | 'danger';

const BUTTON_TONES: Record<ButtonTone, string> = {
  // The accent is reserved for the one action that sends something outward.
  primary:
    'bg-accent text-paper hover:brightness-110 active:brightness-95 disabled:bg-rule-strong disabled:text-muted',
  quiet:
    'border border-rule-strong bg-surface text-ink hover:bg-surface-sunk disabled:text-muted',
  danger:
    'border border-rule-strong bg-surface text-critical hover:bg-critical-soft disabled:text-muted',
};

export function Button({
  tone = 'quiet',
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-[3px] px-4 py-2',
        'text-sm font-semibold transition-all duration-150',
        'disabled:cursor-not-allowed',
        BUTTON_TONES[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunk text-ink-soft',
  accent: 'bg-accent-soft text-accent',
  positive: 'bg-positive-soft text-positive',
  caution: 'bg-caution-soft text-caution',
  critical: 'bg-critical-soft text-critical',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-[2px] px-1.5 py-0.5',
        'text-[0.6875rem] font-semibold tracking-[0.06em] uppercase',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * A horizontal confidence meter.
 *
 * Reads as a measured instrument rather than a progress bar: the value is
 * printed alongside in tabular figures, and the fill is tinted by band so a
 * low-confidence suggestion is visibly different at a glance.
 */
export function Meter({
  value,
  label,
  bands = 'confidence',
}: {
  value: number;
  label: string;
  bands?: 'confidence' | 'sentiment';
}) {
  const tone =
    bands === 'sentiment'
      ? value >= 65
        ? 'bg-positive'
        : value >= 40
          ? 'bg-caution'
          : 'bg-critical'
      : value >= 70
        ? 'bg-positive'
        : value >= 40
          ? 'bg-caution'
          : 'bg-critical';

  return (
    <div className="flex items-center gap-2.5">
      <span className="label-eyebrow shrink-0">{label}</span>
      <div
        className="h-[3px] w-16 shrink-0 overflow-hidden bg-rule"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cx('h-full transition-[width] duration-500', tone)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span data-numeric className="shrink-0 font-mono text-[0.6875rem] text-ink-soft">
        {value}
      </span>
    </div>
  );
}

/** Label/value row used across detail panes. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-1.5">
      <dt className="w-32 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
