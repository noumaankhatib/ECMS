# Phase 9 — Document Completeness

> **Source:** `Engineering_Consultancy_Management_System_Specification.docx` §16 ("Document Register
> and Missing Document Tracking"): _"Each project should have a document register and a configurable
> list of required documents. The system should automatically show missing and overdue documents"_ —
> with its own six-category table (Design, Tests, Authority, Contract, Construction, Completion) and
> suggested display string, _"8 required documents missing"_. See `docs/PROGRESS.md`'s roadmap note
> and `~/.claude/plans/swirling-singing-book.md` (the approved 8-phase — now 9-phase — roadmap) for
> how this fits after Phase 8.
>
> **Status:** Complete.
> **Prerequisite:** Phases 1–8 (done — see `docs/PROGRESS.md`).

---

## 1. What Phase 9 is, in one sentence

Give a project a real, computed answer to "what's still missing" against an admin-configurable
checklist of required document categories, instead of staff having to remember or manually track
which categories a project's own register still lacks.

## 2. Why this next

**It's the roadmap's own next stage**, and the one PRD requirement most directly unaddressed by
Phases 1-8: §16 asks for exactly this, and nothing built so far computes it.

**It reuses two things rather than inventing either.** `Document.category` (Phase 3) is already the
free-text field a completeness check needs to diff against; `ProposalSketchType` (Phase 5) is already
the admin-configurable-catalogue shape a required-documents list needs. Phase 9 adds one new small
table and one new computed endpoint, not a new subsystem.

## 3. Data model

### New: `RequiredDocument`

```prisma
model RequiredDocument {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  category String @db.VarChar(100)
  label    String @db.VarChar(200)
  scope    String @default("ANY") @db.VarChar(20)

  sortOrder  Int       @default(0) @map("sort_order")
  archivedAt DateTime? @map("archived_at") @db.Timestamptz(6)

  @@unique([category, scope])
  @@map("required_document")
}
```

A **global catalogue**, not per-project — the same shape `ProposalSketchType` already is: small, hand
maintained by an administrator, no pagination or search of its own. Seeded on day one with the PRD's
own six categories (`apps/api/prisma/migrations/20260913192900_phase9_seed`), scoped `ANY`, so the
feature is useful without anyone configuring anything first — the same "a starting point, not a closed
list" posture the sketch-type seed already takes.

**Not a foreign key to `Document`.** `Document.category` is deliberately free text
(docs/phase-3-plan.md §8, B6) — there is nothing here for a real relation to point at. Matching happens
by value, at read time (§4).

### `scope`: `PLANNING`, `SUPERVISION`, or `ANY`

Deliberately **not** `Project.type` (`PLANNING`/`SUPERVISION`/`BOTH`) reused directly. A `BOTH` project
runs both workstreams (`WORKSTREAMS_FOR_TYPE`), so a requirement scoped to `PLANNING` must still apply
to a `BOTH` project, not only to a `PLANNING`-type one. `ANY` applies regardless of workstream.

## 4. Completeness — computed, not stored

`GET /projects/:id/documents/completeness` diffs the active (non-archived) `RequiredDocument` rows
whose scope applies to the project's own workstreams against the project's own non-archived
`Document.category` values — never written to the database, computed fresh on every read, the same
"derive, don't duplicate" choice Phase 7 made for `SupervisionAgreement.visitsUsed`.

**Matching is case- and whitespace-insensitive.** `Document.category` is typed by hand on every
upload; an exact-match diff would flag "design" against "Design" as missing for no reason a person
using the system would understand. Both sides are trimmed and lower-cased before comparison.

Response shape:

```ts
interface DocumentCompletenessItem {
  requiredDocumentId: string;
  category: string;
  label: string;
  satisfied: boolean;
}
interface DocumentCompleteness {
  items: DocumentCompletenessItem[];
  missingCount: number;
}
```

**Deliberately narrower than the PRD's own ask.** §16 says "missing **and overdue**" — this phase
answers only "missing". Overdue implies a due-by date or milestone tied to a requirement, which no
part of this system currently models; adding it here would be guessing at a shape nobody has asked
for yet, the same reasoning Phase 7 gave for leaving the "approaching the limit" alert to Phase 11.
Presence/absence is the whole of this phase's scope.

## 5. Permissions

No new resource keyed to documents; one new top-level resource, `required_document`, for the
catalogue itself. A single `required_document:admin` permission — no `required_document:view` — the
same reasoning `sketch_type:admin` already gives: anyone who can see documents already needs to see
the checklist to know what's missing, so seeing it is bundled into `document:view` rather than
checked separately; only mutating the catalogue needs the dedicated admin permission. Seeded to
`SYSTEM_ADMINISTRATOR` and `DOCUMENT_CONTROLLER` (whose own role description — "document metadata,
revisions and controlled records" — already covers exactly this).

`GET /projects/:id/documents/completeness` itself rides `document:view`, the same as every other read
in that module.

## 6. Web

- A `/required-documents` admin page — a table an administrator can add to, rename, rescope, or
  retire, plus an "Add a required document" form. Follows `/sketch-types` exactly in shape.
- The project `/projects/:id/documents` page gains a "Completeness" card at the top: a
  ✓/✗-per-requirement badge row and the PRD's own suggested phrasing ("N required documents
  missing"). Shown only when at least one requirement applies to the project.
- The document upload form's Category field gains a hint pointing at the Completeness card, since
  nothing in the UI _forces_ a typed category to match a requirement's — the free-text nature of
  `Document.category` (§4) means this is a nudge, not a constraint.
- Nav link gated on `required_document:admin`, the same way "Sketch types" is gated on
  `sketch_type:admin`.

## 7. Build order

| #   | Step                                                                                                                                                  | Done when                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 35  | **Data model + admin CRUD** — `RequiredDocument` migration and seed, `RequiredDocumentService` (list/create/update/archive), `/required-documents`    | An administrator can add, rescope, edit and retire a required-document entry; the PRD's six categories exist from day one                                                                          |
| 36  | **Computed completeness** — `GET /projects/:id/documents/completeness`, scope matching against `WORKSTREAMS_FOR_TYPE`, case-insensitive category diff | A fresh project shows every applicable requirement missing; uploading a matching category satisfies it; a `BOTH` project sees `PLANNING`-scoped requirements a `SUPERVISION`-only project does not |
| 37  | **Web** — required-documents admin page, project documents page completeness card, nav link                                                           | Tested through the browser: an added requirement shows missing, then satisfied after a matching upload                                                                                             |

## 8. Definition of done

- The PRD's own six document categories (Design, Tests, Authority, Contract, Construction,
  Completion) exist as active requirements from the first migration, scoped `ANY`.
- A project's completeness is always derived from its own real `Document` rows at read time, never a
  value someone can write directly.
- A requirement's `scope` follows the project's workstreams (`WORKSTREAMS_FOR_TYPE`), not a literal
  `Project.type` match — a `BOTH` project sees `PLANNING`-scoped requirements too.
- Category matching is case- and whitespace-insensitive, so a typed variation in casing does not
  falsely show a requirement as missing.
- A user without `required_document:admin` cannot create, edit or retire a requirement — the API
  refuses it, and the admin web page itself does not render for them.
- Retiring a requirement removes it from new completeness checks without altering what a project's
  completeness meant at any point before the retirement.
- Every catalogue create, edit and retirement writes an audit row.
