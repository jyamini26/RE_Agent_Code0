# Architecture

## The shape of the thing

```
                 ┌──────────────┐
                 │ InboxProvider│   simulated (default) │ gmail
                 └──────┬───────┘
                        │ InboundMessage[]
                        ▼
                 ┌──────────────┐
                 │  Classifier  │   rules (default) │ anthropic
                 └──────┬───────┘
                        │ Classification { intent, confidence, sentiment, signals }
                        ▼
                 ┌──────────────────┐
                 │ buildSuggestion  │  exhaustive over Intent
                 └──────┬───────────┘
                        │ { rationale[], proposedActions[], draft | null }
                        ▼
                 ┌──────────────────┐
                 │    Activity      │  status: pending
                 │  (SQLite row)    │
                 └──────┬───────────┘
                        │
        ╔═══════════════▼════════════════╗
        ║      HUMAN DECISION            ║   ← everything above is advisory
        ║  approve · modify · dismiss    ║
        ╚═══════════════╤════════════════╝
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
       Mailer      Lead stage     Audit ledger
                   (forward only)  (append-only)
```

Everything above the double line is a proposal. Everything below happens only
because a person clicked. That line is the whole design.

---

## Workspaces

```
packages/shared    @reap/shared — zod schemas, inferred types, formatters
apps/api           @reap/api    — Express, SQLite, PDF generation
apps/web           @reap/web    — React, Vite, Tailwind, TanStack Query
```

`apps/*` depend on the compiled output of `packages/shared`, which is why
`npm run build --workspace=@reap/shared` has to happen before the first
typecheck of a fresh clone. CI does this explicitly.

### Why a shared contracts package

The alternative is duplicating request and response shapes on both sides and
keeping them in sync by discipline. With one zod schema per concept, the server
validates against it at the edge and the client imports the inferred type. A
field rename is a compile error in both workspaces on the same run, not a
runtime `undefined` discovered by a user.

The schemas also carry the constraints, not just the shapes: `budgetMin <=
budgetMax`, `limit` capped at 200, `sentiment` bounded to 0–100. Validation and
documentation are the same artifact.

---

## API layering

```
routes/         HTTP. Parse, validate, delegate, shape the response.
services/       Domain logic. No Express type crosses this boundary.
repositories/   The only place SQL is written.
db/             Connection, schema, seed.
```

The rule that keeps this honest: a service never receives a `Request` and never
returns a `Response`. That is what lets `ActivityService.approve` be tested by
calling it directly, and lets the routes stay thin enough to read in one pass.

Errors flow to a single handler (`middleware/errors.ts`) that maps domain
exceptions to status codes. `ActivityAlreadyResolvedError` becomes a 409 in one
place rather than in every route that could raise it.

### Dependency injection

`createContainer()` builds the object graph explicitly — no framework, no
decorators. The graph is small enough to read top to bottom, and tests build one
with `{ databasePath: ':memory:', mailer: new StubMailer() }` instead of
reaching for module mocks. `createApp(container)` is a factory rather than a
module-level singleton for the same reason: every integration test gets a real,
isolated application.

---

## Strategy interfaces

Two seams, each with a zero-credential default and a production implementation.

### InboxProvider

```ts
interface InboxProvider {
  readonly name: string;
  fetchRecent(options: {
    since: Date | null;
    limit: number;
  }): Promise<InboundMessage[]>;
}
```

`SimulatedInboxProvider` replays seven fixtures chosen to exercise every
classifier branch and every suggestion template, including the low-confidence
path that deliberately produces no draft. Timestamps are relative to process
start so the feed always looks recent.

`GmailInboxProvider` polls the Gmail REST API with a typed `fetch` client. It
deliberately does **not** use the `googleapis` package: that vendors the entire
Google API surface — and, at the time of writing, a transitive advisory chain
through gaxios — to call two endpoints. Hand-writing the two response shapes is
smaller, dependency-free, and trivially stubbable.

Providers may return messages already seen. Deduplication is the caller's job,
enforced by a `UNIQUE` constraint on `activities.external_id` and an
`INSERT OR IGNORE`, so concurrent polls cannot race into a duplicate approval
request.

### Classifier

```ts
interface Classifier {
  readonly name: string;
  classify(message: InboundMessage): Promise<Classification>;
}
```

`RulesClassifier` is a deterministic keyword matcher with priority tie-breaking,
so "urgent problem with the offer" routes to `issue` rather than `offer`. It
caps confidence at 92 — a keyword classifier should not claim certainty.

`AnthropicClassifier` forces a tool call so the model cannot return prose that
fails validation, and **falls back to the rules classifier on any failure**. A
classification outage should degrade suggestion quality, not stop the inbox from
being processed.

The classifier's `name` is stored on every activity, so the ledger records which
system produced a given judgement.

---

## Persistence

SQLite via `better-sqlite3`. The whole database is one file, so a reviewer gets
working persistence with nothing to install. The repository layer is the only
code touching SQL, which keeps a future move to Postgres contained to five
files.

Notable schema decisions:

- **`activities.external_id UNIQUE`** — idempotent ingestion, as above.
- **JSON in TEXT columns** for short arrays (`features`, `rationale`,
  `signals`). They are always read whole and never queried into; a join table
  would buy nothing. `encodeJson`/`decodeJson` are the only encode/decode
  points, and `decodeJson` degrades a malformed row to an empty value rather
  than taking down the list endpoint it appears in.
- **`audit_entries` is append-only.** `AuditRepository` exposes `record` and
  `list`. There is no update and no delete, and that is the point.

Derived values are computed, not stored. `daysOnMarket` is a function of
`listedAt`, so it cannot go stale.

---

## Frontend

React 19, Vite, Tailwind 4 (CSS-first `@theme`), TanStack Query, React Router.

**Server state lives in TanStack Query; there is no client state manager.**
Almost everything on screen is server-owned, and the little that isn't — which
row is selected, whether the draft editor is open — is local component state.
Adding Redux here would mean maintaining a second copy of the server's data.

Query keys are centralised in `lib/queries.ts`. Approving an activity can send
an email, advance a lead, and append to the ledger, so three unrelated views go
stale at once; `invalidateAfterDecision` makes that coupling explicit in one
place instead of scattering invalidations across components.

### The design

An **editorial dossier**: warm paper ground, ink text, hairline rules, tabular
figures, and a single accent reserved exclusively for actions that leave the
building. Each message is presented as a case file — original, then reasoning,
then plan, then draft, with the decision bar pinned at the foot.

Reasoning sits **above** the draft on purpose. A reviewer who reads the draft
first is proof-reading; one who reads the reasoning first is deciding.

The approve button is disabled while the draft has unsaved edits. Without that
gate the ledger could record a send whose text differs from what the reviewer
last saw.

---

## Trade-offs and what would change at scale

| Now                                       | At scale                                                             |
| ----------------------------------------- | -------------------------------------------------------------------- |
| SQLite, single writer                     | Postgres; the repository interfaces are the seam                     |
| `setInterval` polling                     | Gmail push notifications via Pub/Sub                                 |
| Property matched by scanning all listings | Full-text index on the address column                                |
| No authentication                         | Session auth; every route already flows through one middleware stack |
| In-process ingestion loop                 | A worker, so an API restart cannot drop a poll                       |
| Audit trail in the same database          | Append-only store with retention guarantees                          |

None of these are hidden. They are the honest boundary of a project built to
demonstrate structure rather than to carry production traffic.
