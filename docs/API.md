# API reference

Base URL `http://localhost:3001/api`. Generated PDFs are served from
`/documents/<filename>` (no `/api` prefix).

## Envelope

Every response is `{ data, meta? }` or `{ error }`. Clients discriminate on the
presence of `error` rather than on the status code.

```jsonc
// success
{ "data": { ... } }

// paginated
{ "data": [...], "meta": { "total": 42, "limit": 50, "offset": 0 } }

// failure
{ "error": { "code": "not_found", "message": "Activity not found" } }

// validation failure (422) additionally carries per-field detail
{
  "error": {
    "code": "validation_failed",
    "message": "Request failed validation",
    "issues": [{ "path": "budgetMin", "message": "budgetMin must be less than or equal to budgetMax" }]
  }
}
```

### Status codes

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 200  | Success                                                          |
| 201  | Resource created                                                 |
| 204  | Deleted, no body                                                 |
| 400  | Malformed path parameter                                         |
| 404  | No such resource or route                                        |
| 409  | Conflict — duplicate lead email, or an already-resolved activity |
| 422  | Request failed schema validation, or there is no draft to send   |
| 500  | Unhandled error (details are logged, not returned)               |

All list endpoints accept `limit` (1–200, default 50) and `offset` (default 0).

---

## System

| Method | Path            | Notes                                                |
| ------ | --------------- | ---------------------------------------------------- |
| GET    | `/health`       | Status, version, uptime, active inbox and classifier |
| GET    | `/agent`        | Configured agent identity                            |
| GET    | `/config`       | Which strategies are active. Never credentials.      |
| GET    | `/inbox/status` | Polling state, pending and processed counts          |
| POST   | `/inbox/start`  | Begin polling                                        |
| POST   | `/inbox/stop`   | Stop polling                                         |
| POST   | `/inbox/poll`   | Force one pass now → `{ fetched, created, skipped }` |
| GET    | `/audit`        | Audit trail. `?subjectId=` filters to one subject.   |

---

## Activities

An activity is one inbound message, its classification, the reasoning behind the
suggestion, and the draft awaiting a decision.

| Method | Path                      | Notes                                          |
| ------ | ------------------------- | ---------------------------------------------- |
| GET    | `/activities`             | `?status=pending\|approved\|dismissed\|failed` |
| GET    | `/activities/:id`         |                                                |
| POST   | `/activities/:id/approve` | Sends the draft, advances the lead             |
| POST   | `/activities/:id/modify`  | Edits the draft, stays pending                 |
| POST   | `/activities/:id/dismiss` | Resolves without sending                       |

Only a `pending` activity can be approved, modified, or dismissed; anything else
returns 409. Approving an activity whose `draft` is `null` returns 422.

```jsonc
// POST /activities/:id/modify
{ "draft": { "subject": "Optional", "body": "Optional", "to": "Optional" } }

// POST /activities/:id/dismiss
{ "reason": "Handled by phone" }   // optional, recorded in the audit detail
```

### Approval semantics

1. Reject unless the activity is `pending` and has a draft.
2. Send via the configured mailer. **On failure**: mark `failed`, record the
   error, write an audit entry, and return 500. Nothing is sent.
3. On success: mark `approved`, refresh the lead's last-contact date, and
   advance its stage — forward only.
4. Write the approval to the audit trail, including the exact draft sent.

Stage advancement maps `new_lead → new`, `inquiry → qualified`,
`showing_request → showing`, `offer → offer`. Other intents leave the stage
untouched, because a follow-up or a complaint says nothing reliable about deal
progression.

---

## Leads

| Method | Path             | Notes                                                  |
| ------ | ---------------- | ------------------------------------------------------ |
| GET    | `/leads`         | `?stage=new\|qualified\|showing\|offer\|closing\|lost` |
| GET    | `/leads/summary` | Per-stage counts and pipeline value                    |
| GET    | `/leads/:id`     |                                                        |
| POST   | `/leads`         | 409 if the email already exists                        |
| PATCH  | `/leads/:id`     | Partial update                                         |

`/leads/summary` always returns all six stages, including empty ones, in
pipeline order, so the board renders a stable set of columns.

---

## Properties

| Method | Path              | Notes                                        |
| ------ | ----------------- | -------------------------------------------- |
| GET    | `/properties`     | `?status=listed\|pending\|closed\|withdrawn` |
| GET    | `/properties/:id` |                                              |
| POST   | `/properties`     |                                              |
| PATCH  | `/properties/:id` |                                              |

---

## Documents

| Method | Path                       | Notes                           |
| ------ | -------------------------- | ------------------------------- |
| GET    | `/documents`               | Index of generated files        |
| POST   | `/documents/cma`           | `{ propertyId, comparables[] }` |
| POST   | `/documents/brochure`      | `{ propertyId }`                |
| POST   | `/documents/market-report` | Market figures, no property     |
| DELETE | `/documents/:id`           | **By id, not filename**         |

Deletion takes the document id. The filename handed to the filesystem comes from
the database row, so no user-controlled string reaches a path. See
`resolveWithinDirectory` in `apps/api/src/services/documents.ts` for the second
layer of that defence.

```jsonc
// POST /documents/cma
{
  "propertyId": "prop_...",
  "comparables": [
    {
      "address": "402 Aldergrove Lane",
      "price": 822000,
      "bedrooms": 4,
      "bathrooms": 3,
      "sqft": 2880,
      "soldAt": null,
    },
  ],
}
```

Returns `{ data: { id, kind, filename, url, propertyId, sizeBytes, createdAt } }`
with a 201. Fetch the PDF from `url`.
