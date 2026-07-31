import type { Property } from '@reap/shared';
import {
  daysOnMarket,
  formatPrice,
  formatPricePerSqft,
  formatRelativeTime,
  formatSqft,
  titleCase,
} from '@reap/shared';
import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  Pane,
  Skeleton,
  cx,
} from '../components/primitives.js';
import { useDocuments, useGenerateDocument, useProperties } from '../lib/queries.js';

const STATUS_TONE = {
  listed: 'positive',
  pending: 'caution',
  closed: 'neutral',
  withdrawn: 'neutral',
} as const;

export function Listings() {
  const properties = useProperties();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = properties.data?.data ?? [];
  const selected = items.find((p) => p.id === selectedId) ?? items[0] ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(280px,340px)_1fr]">
      <Pane title={`Listings · ${items.length}`} className="border-r">
        {properties.isPending ? <Skeleton rows={4} /> : null}
        {properties.isError ? (
          <ErrorNote message={(properties.error as Error).message} />
        ) : null}

        <ul className="divide-y divide-rule">
          {items.map((property, index) => (
            <li key={property.id}>
              <button
                onClick={() => setSelectedId(property.id)}
                style={{ animationDelay: `${Math.min(index, 6) * 30}ms` }}
                className={cx(
                  'animate-rise relative block w-full px-5 py-3.5 text-left transition-colors',
                  property.id === selected?.id
                    ? 'bg-surface-sunk'
                    : 'hover:bg-surface-sunk/60',
                )}
              >
                <span
                  className={cx(
                    'absolute inset-y-0 left-0 w-[2px]',
                    property.id === selected?.id ? 'bg-accent' : 'bg-transparent',
                  )}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {property.address}
                  </span>
                  <Badge tone={STATUS_TONE[property.status]}>{property.status}</Badge>
                </div>
                <p data-numeric className="mt-0.5 font-mono text-[0.75rem] text-muted">
                  {formatPrice(property.price)} · {property.bedrooms}bd{' '}
                  {property.bathrooms}ba · {formatSqft(property.sqft)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </Pane>

      {selected ? (
        <PropertyDetail key={selected.id} property={selected} />
      ) : (
        <div className="flex h-full items-center justify-center bg-paper">
          <EmptyState title="No listings" />
        </div>
      )}
    </div>
  );
}

/** Sample comparables sent with a CMA request in the demo. */
function demoComparables(property: Property) {
  const base = Math.round(property.price / Math.max(property.sqft, 1));
  return [
    {
      address: `Nearby comparable A`,
      price: Math.round(property.price * 0.96),
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sqft: Math.round(property.sqft * 0.97),
      soldAt: null,
    },
    {
      address: `Nearby comparable B`,
      price: Math.round(property.price * 1.04),
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sqft: Math.round(property.sqft * 1.05),
      soldAt: null,
    },
    {
      address: `Nearby comparable C`,
      price: Math.round(base * property.sqft * 0.93),
      bedrooms: Math.max(1, property.bedrooms - 1),
      bathrooms: Math.max(1, property.bathrooms - 1),
      sqft: Math.round(property.sqft * 0.88),
      soldAt: null,
    },
  ];
}

function PropertyDetail({ property }: { property: Property }) {
  const generate = useGenerateDocument();
  const documents = useDocuments();

  const forProperty = (documents.data?.data ?? []).filter(
    (doc) => doc.propertyId === property.id,
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <header className="animate-rise">
          <Badge tone={STATUS_TONE[property.status]}>
            {titleCase(property.status)}
          </Badge>
          <h1 className="mt-3 font-display text-[1.75rem] leading-tight font-semibold">
            {property.address}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {property.neighborhood ? `${property.neighborhood}, ` : ''}
            {property.city}
          </p>
          <p data-numeric className="mt-4 font-display text-3xl font-semibold text-ink">
            {formatPrice(property.price)}
          </p>
        </header>

        <section
          className="animate-rise mt-8 border-t border-rule pt-5"
          style={{ animationDelay: '60ms' }}
        >
          <h2 className="label-eyebrow mb-2">Details</h2>
          <dl>
            <Field label="Configuration">
              {property.bedrooms} bed · {property.bathrooms} bath
            </Field>
            <Field label="Interior">{formatSqft(property.sqft)}</Field>
            <Field label="Price per sq ft">
              {formatPricePerSqft(property.price, property.sqft)}
            </Field>
            <Field label="Lot">
              {property.lotSizeSqft ? formatSqft(property.lotSizeSqft) : '—'}
            </Field>
            <Field label="Year built">{property.yearBuilt ?? '—'}</Field>
            <Field label="Type">{titleCase(property.propertyType)}</Field>
            <Field label="Days on market">{daysOnMarket(property)}</Field>
          </dl>
        </section>

        {property.description ? (
          <section
            className="animate-rise mt-8 border-t border-rule pt-5"
            style={{ animationDelay: '100ms' }}
          >
            <h2 className="label-eyebrow mb-2">Description</h2>
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
              {property.description}
            </p>
          </section>
        ) : null}

        {property.features.length > 0 ? (
          <section
            className="animate-rise mt-8 border-t border-rule pt-5"
            style={{ animationDelay: '140ms' }}
          >
            <h2 className="label-eyebrow mb-2">Features</h2>
            <ul className="space-y-1.5">
              {property.features.map((feature) => (
                <li key={feature} className="flex gap-2.5 text-sm text-ink-soft">
                  <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-accent" />
                  {feature}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          className="animate-rise mt-8 border-t border-rule pt-5"
          style={{ animationDelay: '180ms' }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="label-eyebrow">Documents</h2>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  generate.mutate({ kind: 'brochure', propertyId: property.id })
                }
                disabled={generate.isPending}
                className="!px-3 !py-1.5 !text-xs"
              >
                Brochure
              </Button>
              <Button
                onClick={() =>
                  generate.mutate({
                    kind: 'cma',
                    propertyId: property.id,
                    comparables: demoComparables(property),
                  })
                }
                disabled={generate.isPending}
                className="!px-3 !py-1.5 !text-xs"
              >
                CMA
              </Button>
            </div>
          </div>

          {generate.isError ? (
            <p className="mb-3 text-sm text-critical">
              {(generate.error as Error).message}
            </p>
          ) : null}

          {forProperty.length === 0 ? (
            <p className="text-sm text-muted">
              None yet. Generating one writes a real PDF to the server and records it in
              the ledger.
            </p>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {forProperty.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <div className="min-w-0">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium text-accent hover:underline"
                    >
                      {doc.filename}
                    </a>
                    <p className="text-[0.6875rem] text-muted">
                      {titleCase(doc.kind)} · {(doc.sizeBytes / 1024).toFixed(1)} KB ·{' '}
                      {formatRelativeTime(doc.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
