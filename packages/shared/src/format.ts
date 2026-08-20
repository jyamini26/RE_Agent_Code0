/**
 * Presentation helpers shared by the PDF generator and the web client, so a
 * price rendered in a brochure matches the price rendered on screen.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const decimal = new Intl.NumberFormat('en-US');

export function formatPrice(value: number): string {
  return usd.format(value);
}

/**
 * `$4.2M` — used where column width is tight, such as pipeline cards.
 *
 * The trailing `.0` is stripped explicitly rather than left to the formatter.
 * ICU disagrees with itself across Node releases on whether compact notation
 * emits it, so `$845,000` renders as `$845K` on one runtime and `$845.0K` on
 * another. Normalising here keeps a brochure generated on a server identical
 * to the same figure rendered in the browser, which is the entire point of
 * this module.
 */
export function formatPriceCompact(value: number): string {
  return compactUsd.format(value).replace(/\.0(?=\D*$)/, '');
}

export function formatNumber(value: number): string {
  return decimal.format(value);
}

export function formatSqft(value: number): string {
  return `${decimal.format(value)} sq ft`;
}

export function formatPricePerSqft(price: number, sqft: number): string {
  if (sqft <= 0) return 'n/a';
  return `${usd.format(Math.round(price / sqft))}/sq ft`;
}

/** `2 hours ago`, `3 days ago`. Falls back to a date beyond four weeks. */
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';

  const diffMs = now.getTime() - then;
  if (diffMs < 0) return 'scheduled';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 28) return `${days} day${days === 1 ? '' : 's'} ago`;

  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** `29 Jul` — for dense rows where the year is implied by context. */
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Turns a snake_case enum member into Title Case for display, so the UI never
 * has to carry a parallel label map that can fall out of sync with the schema.
 */
export function titleCase(value: string): string {
  return value
    .split('_')
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}
