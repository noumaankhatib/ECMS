# Phase 7 — Supervision Agreements

> **Source:** `Engineering_Consultancy_Management_System_Specification.docx` §6 ("Supervision Workflow")
> on monthly vs. on-call site-visit contracts, cross-checked against `2011 Supervision Projects.xlsx` —
> the real register staff run today, whose live `Type Of Agreement` and `Agreement Amount` columns prove
> this is an active workflow, not a hypothetical one. See `docs/PROGRESS.md`'s roadmap note and
> `~/.claude/plans/swirling-singing-book.md` (the approved 8-phase roadmap) for how this fits after
> Phase 6.
>
> **Status:** Complete — see `docs/PROGRESS.md` Steps 29-31.
> **Prerequisite:** Phases 1–6 (done — see `docs/PROGRESS.md`).

---

## 1. What Phase 7 is, in one sentence

Give a Supervision (or BOTH-type) project a real record of the commercial agreement under which site
visits happen — monthly retainer or a fixed on-call quota, an amount, a date range — and show how much of
that quota has actually been used, derived from the site visits already logged (Phase 2).

## 2. Why this next

**It's the roadmap's own next stage.** Row 6 of the end-to-end flow ("Supervision contract starts")
follows directly after Phase 1's `Project.type` already distinguishing PLANNING/SUPERVISION/BOTH and before
Phase 2's site visits/observations/instructions (already built) actually happen. Nothing today records
_why_ a visit is happening at all — only that it did.

**The real register proves the shape.** `2011 Supervision Projects.xlsx`'s `Type Of Agreement` and
`Agreement Amount` columns are exactly the two facts this phase needs to capture; nothing here is
speculative.

**It reuses `SiteVisit` rather than duplicating it.** Phase 2's `SiteVisit` table already has everything
needed to compute "visits used" — a per-project, dated log. This phase adds the quota to compare it
against, not a second way of counting visits.

## 3. Data model

### New: `SupervisionAgreement`

```
model SupervisionAgreement {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  projectId String  @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Restrict)

  /// MONTHLY (a retainer — visitsAllowed is a per-month figure) or ON_CALL
  /// (a fixed quota for the whole agreement period).
  type String @db.VarChar(20)

  visitsAllowed Int      @map("visits_allowed")
  amount        Decimal  @db.Decimal(12, 2)
  startDate     DateTime @map("start_date") @db.Date
  endDate       DateTime? @map("end_date") @db.Date

  /// Set by a renewal action (§5), never by a plain edit — an agreement
  /// that renews is a fact about its own history, the same reason
  /// `DrawingRevision.supersededAt` is never hand-edited either.
  renewedAt     DateTime? @map("renewed_at") @db.Timestamptz(6)
  renewedFromId String?   @map("renewed_from_id") @db.Uuid
  renewedFrom   SupervisionAgreement? @relation("AgreementRenewal", fields: [renewedFromId], references: [id], onDelete: SetNull)
  renewals      SupervisionAgreement[] @relation("AgreementRenewal")

  notes String? @db.Text

  version Int @default(1)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy String?  @map("created_by") @db.Uuid

  @@index([projectId])
  @@map("supervision_agreement")
}
```

**A project may hold more than one agreement over its life** (renewals, or a changed arrangement) —
`SupervisionAgreement` is not 1:1 with `Project`. There is no `Project.currentAgreementId` column; "the
active one" is derived at read time (§4) the same way `Drawing.currentRevisionId` is the one _stored_
exception to "derive, don't duplicate" in this codebase (a revision's own currency is checked constantly
enough to be worth a column) — an agreement's currency is checked far less often, so here the plain
derivation is the right call, not the stored pointer.

### `visitsUsed` — computed, not stored

`GET /projects/:id/supervision/agreements/:agreementId` (and the list) returns `visitsUsed`, a count of
`SiteVisit` rows for the project with `visitDate` between the agreement's `startDate` and
(`endDate` ?? now) — the same "derive, don't duplicate" choice Phase 3 already made for
`Drawing.currentRevisionId` vs. a superseded-index, and the same one the roadmap plan itself named for
this exact field (`swirling-singing-book.md` Phase 7 section). Never written to the database; computed
fresh on every read.

For `MONTHLY` agreements, `visitsAllowed` is a per-month figure — `visitsUsed` for that type is scoped to
the current calendar month (`visitDate` within [start of this month, now]), not the agreement's whole
lifetime, since a monthly quota resets every month by definition. For `ON_CALL`, `visitsUsed` covers the
agreement's entire active period, since the quota is fixed for the whole term.

## 4. "The active agreement"

No stored pointer (§3). `GET /projects/:id/supervision/agreements/current` returns the one agreement,
if any, where `startDate <= today` and (`endDate` is null or `endDate >= today`) and `renewedAt` is null —
picking the most recently created if more than one somehow matches (shouldn't happen in practice, but the
query needs a deterministic tie-break rather than an arbitrary one). Used by the project page (§7) to show
the quota indicator without the caller having to know which agreement id is current.

## 5. Renewal

`POST /projects/:id/supervision/agreements/:agreementId/renew` — refuses if the source agreement's
`renewedAt` is already set (an agreement renews at most once down any one path; a second renewal
attempt should renew the _new_ agreement, not layer a second renewal onto the same one). Inside one
transaction: creates a new `SupervisionAgreement` row copying `type`/`visitsAllowed`/`amount` from the
source (all overridable by the caller's request body — a renewal often changes the amount), sets its
`startDate` to the caller-supplied date (defaulting to the day after the source's `endDate`, or today if
the source had none), and stamps the source's own `renewedAt` + links `renewedFromId` on the new row. Not
a status transition (no `canTransitionX` table) — an agreement has no status at all, just a period and a
renewal fact, the same way `DrawingRevision.supersededAt` is a fact stamped by creating the next one, not
a state machine.

## 6. Permissions

No new resource. Rides the existing `supervision:view/create/edit` (project-scoped, seeded since Phase 2)
— an agreement is supervision-workflow data in exactly the sense those verbs already cover, the same
reasoning Phase 6 used to avoid a new `submission_review:*`/`submission_meeting:*` pair.

## 7. Surfacing the quota

The project page (`apps/web/src/app/(app)/projects/[id]/page.tsx`) gains a small "Supervision agreement"
card, visible only when `project.type` is `SUPERVISION` or `BOTH`: the current agreement's type, amount,
period, and a `visitsUsed / visitsAllowed` indicator. This phase only shows the number — an "approaching
the limit" alert is explicitly Phase 11's job (notifications), not this one's, per the roadmap's own
sequencing note.

A dedicated `/projects/:id/supervision/agreements` list + create/renew page follows the Drawings/Site
Visit precedent for anything with more than one or two fields worth a form of its own.

## 8. Build order

| #   | Step                                                                                                                                                                   | Done when                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 29  | **Data model + CRUD** — `SupervisionAgreement` migration, `SupervisionAgreementService` (list/byId/create/update), nested under `/projects/:id/supervision/agreements` | An agreement can be created against a Supervision/BOTH project with a type, quota, amount and period; listed and edited with optimistic locking                                                                                |
| 30  | **Computed quota + "current" lookup** — `visitsUsed` on read, `GET .../agreements/current`, renewal action                                                             | `visitsUsed` matches a manual count of `SiteVisit` rows for the right window; the current agreement is found without the caller naming an id; a renewed agreement links both directions and the source cannot be renewed twice |
| 31  | **Web** — project-page quota card, agreements list/create/renew page                                                                                                   | Tested through the browser: an agreement is created, its quota shows correctly against logged visits, and renewing produces a second, linked agreement                                                                         |

## 9. Definition of done

- A Supervision or BOTH project can have a supervision agreement recorded: type, quota, amount, period.
- `visitsUsed` is always derived from real `SiteVisit` rows, never a value someone can write directly.
- The "current" agreement is found by date, not by the caller supplying an id.
- Renewing an agreement creates a new, linked row and marks the source renewed; a second renewal attempt
  on an already-renewed source is refused.
- A user without `supervision:view` gets nothing for any agreement endpoint — the same non-member test
  every prior resource has.
- Every create, edit and renewal writes an audit row.
- The project page shows the quota indicator only for Supervision/BOTH projects, and shows nothing
  presumptuous (like an "over quota" warning) — that is explicitly out of scope until Phase 11.
