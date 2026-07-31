import { formatRelativeTime } from '@reap/shared';
import { NavLink, Outlet } from 'react-router';
import { useAgent, useHealth, useInboxStatus, usePollInbox } from '../lib/queries.js';
import { ThemeToggle } from './ThemeToggle.js';
import { Button, cx } from './primitives.js';

const NAV = [
  { to: '/', label: 'Review', hint: 'Pending decisions', end: true },
  { to: '/pipeline', label: 'Pipeline', hint: 'Leads by stage' },
  { to: '/listings', label: 'Listings', hint: 'Properties and documents' },
  { to: '/ledger', label: 'Ledger', hint: 'Audit trail' },
] as const;

export function Shell() {
  const health = useHealth();
  const inbox = useInboxStatus();
  const agent = useAgent();
  const poll = usePollInbox();

  const pending = inbox.data?.pendingCount ?? 0;
  const offline = health.isError;

  return (
    <div className="grain flex h-dvh flex-col bg-paper text-ink">
      {/* ---- Masthead ---- */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-6 border-b border-rule bg-surface px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl font-semibold tracking-tight">
            REAP
          </span>
          <span className="hidden text-xs text-muted sm:inline">
            {agent.data ? `${agent.data.name} · ${agent.data.brokerage}` : 'Agent desk'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <StatusDot
            offline={offline}
            provider={health.data?.inbox.provider}
            lastPolledAt={inbox.data?.lastPolledAt ?? null}
          />
          <Button
            onClick={() => poll.mutate()}
            disabled={poll.isPending || offline}
            className="!px-3 !py-1.5 !text-xs"
          >
            {poll.isPending ? 'Checking…' : 'Check inbox'}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- Rail ---- */}
        <nav
          aria-label="Sections"
          className="relative z-10 flex w-[168px] shrink-0 flex-col border-r border-rule bg-surface"
        >
          <ul className="flex flex-col py-2">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) =>
                    cx(
                      'group relative block px-5 py-2.5 transition-colors',
                      isActive ? 'text-ink' : 'text-muted hover:text-ink-soft',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active marker sits in the rule itself, so selection
                          reads as a tab on a file rather than a filled pill. */}
                      <span
                        className={cx(
                          'absolute top-0 bottom-0 -right-px w-[2px] transition-all',
                          isActive ? 'bg-accent' : 'bg-transparent',
                        )}
                      />
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{item.label}</span>
                        {item.label === 'Review' && pending > 0 ? (
                          <span
                            data-numeric
                            className="font-mono text-[0.6875rem] text-accent"
                          >
                            {pending}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[0.6875rem] text-muted">
                        {item.hint}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mt-auto border-t border-rule px-5 py-4">
            <p className="label-eyebrow">Mode</p>
            <p className="mt-1 font-mono text-[0.6875rem] leading-relaxed text-muted">
              {health.data?.classifier ?? '—'}
              <br />
              {health.data?.inbox.provider ?? '—'} inbox
            </p>
          </div>
        </nav>

        {/* ---- Content ---- */}
        <main className="relative z-10 min-w-0 flex-1 overflow-hidden">
          {offline ? <OfflineBanner /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function StatusDot({
  offline,
  provider,
  lastPolledAt,
}: {
  offline: boolean;
  provider?: string;
  lastPolledAt: string | null;
}) {
  return (
    <span className="hidden items-center gap-2 md:flex">
      <span
        className={cx('size-1.5 rounded-full', offline ? 'bg-critical' : 'bg-positive')}
        aria-hidden
      />
      <span className="text-[0.6875rem] text-muted">
        {offline
          ? 'API unreachable'
          : `${provider ?? 'inbox'} · ${formatRelativeTime(lastPolledAt)}`}
      </span>
    </span>
  );
}

function OfflineBanner() {
  return (
    <div
      role="alert"
      className="border-b border-critical bg-critical-soft px-6 py-2.5 text-sm"
    >
      Cannot reach the API. Start it with{' '}
      <code className="font-mono text-[0.8125rem]">npm run dev</code> from the repo
      root.
    </div>
  );
}
