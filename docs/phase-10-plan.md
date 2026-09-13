# Phase 10 — Handover & Closure Gate

> **Source:** `Engineering_Consultancy_Management_System_Specification.docx`'s own Phase 4 —
> Closure ("final inspection, defects closed, authority completion documents, tests, as-built,
> warranties, final report, handover record") — see `docs/PROGRESS.md`'s roadmap note and
> `~/.claude/plans/swirling-singing-book.md` (the approved roadmap) for how this fits after Phase 9.
>
> **Status:** Complete.
> **Prerequisite:** Phases 1–9 (done — see `docs/PROGRESS.md`).

---

## 1. What Phase 10 is, in one sentence

Give `COMPLETED → CLOSED` — until now the one project transition with no precondition at all
(`docs/PROGRESS.md`'s Step 6 built the state machine; nothing has ever checked what a real closure
should require) — a real gate: a project cannot close with open issues, missing required documents,
or an incomplete handover checklist.

## 2. Why this next

**It's the roadmap's own next stage**, landing last of the workflow phases (Phase 11 is read-only
reporting) precisely because it depends on Phases 6–9's own data — open submissions, unresolved
modifications' effect on issues, missing documents — to have something real to check against.

**It reuses three things rather than inventing any of them.** `Issue.status` (Phase 2) already says
whether defects are closed. `DocumentService.completeness()` (Phase 9) already computes missing
documents. `ProjectService.transition()` (Phase 1, Step 6) is already the one place a status change
is checked and written — this phase adds one more precondition to it, not a second mechanism.

## 3. Data model

### New: `HandoverChecklist`

The items PRD's Closure phase names that **no existing table already answers** — final inspection,
authority completion documents received, mandatory tests received, as-built received, warranties
received, and the final report issued. Each is a date-or-not field, the same treatment
`Milestone.achievedDate` and `Instruction.actionedAt` already get: a thing is either done or it
isn't, and _when_ is the only extra fact worth keeping.

```prisma
model HandoverChecklist {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  projectId String  @unique @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Restrict)

  finalInspectionAt       DateTime? @map("final_inspection_at") @db.Timestamptz(6)
  authorityDocsReceivedAt DateTime? @map("authority_docs_received_at") @db.Timestamptz(6)
  testsReceivedAt         DateTime? @map("tests_received_at") @db.Timestamptz(6)
  asBuiltReceivedAt       DateTime? @map("as_built_received_at") @db.Timestamptz(6)
  warrantiesReceivedAt    DateTime? @map("warranties_received_at") @db.Timestamptz(6)
  finalReportIssuedAt     DateTime? @map("final_report_issued_at") @db.Timestamptz(6)

  version Int @default(1)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("handover_checklist")
}
```

`projectId` is `@unique` — one row per project, not a register. The row is created lazily (an
`upsert` inside `get`/`update`, never a migration-time backfill) the first time anyone reads or
edits it, the same "nothing to see until something happens" posture `SupervisionAgreement` does
**not** need (a project can have zero agreements and that's a real, visible fact) but a single
per-project settings-shaped row does: a project with no row yet is simply a project where nothing
has been checked off, not a project the system forgot.

**Deliberately not stored here — derived instead, at read and at gate time:**

- **Open issues.** `Issue.status != 'CLOSED'` is already the real answer (Phase 2); a
  `defectsClosedAt` checkbox next to it would be a second, disagreeing source of truth the moment
  someone reopens an issue after ticking the box.
- **Missing documents.** `DocumentService.completeness()` (Phase 9) is already the real answer.

This is the same "derive, don't duplicate" choice Phase 7 made for `SupervisionAgreement.visitsUsed`
and Phase 9 made for completeness itself — applied a third time, to the two items on PRD's own
closure list that already have a real table behind them.

## 4. The gate

`ProjectService.transition()` (`apps/api/src/modules/projects/project.service.ts`) gains one more
check, reached only when `target === 'CLOSED'` (i.e. only the `close` action, only from
`COMPLETED` — the transition table already refuses every other path to `CLOSED`): the project's
open issue count, missing-document count, and every `HandoverChecklist` field must all be
clear/complete. A failing check throws a new `HANDOVER_INCOMPLETE` error naming which of the three
groups is still outstanding, refused the same way an illegal transition is — recorded in its own
transaction, since nothing changed.

`HANDOVER_INCOMPLETE` is a new entry in `error-catalogue.ts` rather than reusing
`ILLEGAL_TRANSITION`: the move is legal (the state machine allows `COMPLETED → CLOSED`) but a
business precondition is unmet — a different fact than "the status machine doesn't allow this",
the same distinction `DEPENDENCY_EXISTS` already draws from `ILLEGAL_TRANSITION` for archival.

## 5. Endpoints

Rides `project:view`/`project:edit` — no new permission resource, the same reasoning Phase 8 gave
for `Modification` riding `planning:*`: this checklist is not its own resource family, it is one
more fact about a project's own lifecycle.

- `GET /projects/:id/handover` — the checklist row (created on first read if absent), plus computed
  `openIssueCount`, `missingDocumentCount`, and an overall `ready: boolean`.
- `PATCH /projects/:id/handover` — sets or clears any of the six timestamp fields (a boolean in, a
  timestamp or `null` out — the same treatment the `Instruction` edit endpoint gives
  `actionedAt`), guarded by `version` the same as every other editable record.

## 6. Web

- The project detail page gains a "Handover" card once the project reaches `COMPLETED`: the six
  checklist items as checkboxes, plus the live open-issues and missing-documents counts pulled from
  existing pages rather than restated. The `close` action button is disabled with an explanatory
  message (not merely hidden — a `403`-shaped hidden control would be indistinguishable from a
  permissions problem) until `ready` is true.
- The interface hides; the API refuses — the same rule Step 8 established. Disabling the button is
  a courtesy; `HANDOVER_INCOMPLETE` is what actually stops it.

## 7. Build order

| #   | Step                                                                                                                                             | Done when                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 38  | **Data model + endpoints** — `HandoverChecklist` migration, `HandoverService` (get/update, lazily created), `GET`/`PATCH /projects/:id/handover` | A checklist can be read and edited on any open project; open-issue and missing-document counts are computed, not stored                                                   |
| 39  | **The gate** — `HANDOVER_INCOMPLETE` error code, `ProjectService.transition()` checks it only for `close`                                        | `complete → close` is refused with the outstanding items named until issues are closed, documents uploaded and the checklist ticked; every other transition is unaffected |
| 40  | **Web** — project page Handover card, disabled `close` button with reason, nav-free (it lives on the project page, not its own route)            | Tested through the browser: closing is blocked, then succeeds once every item is satisfied                                                                                |

## 8. Definition of done

- `COMPLETED → CLOSED` is refused while any issue on the project is open, any required document is
  missing, or any `HandoverChecklist` field is unset — and the refusal is recorded in the audit
  trail the same as any other refused transition.
- Every other transition (`activate`, `hold`, `complete`) is unaffected — the gate is reached only
  for `target === 'CLOSED'`.
- Open-issue and missing-document counts are always computed fresh from `Issue`/`Document` rows,
  never a value a caller can write directly.
- A project with zero issues, zero applicable required documents, and a fully ticked checklist can
  close; flipping any one of the three back to incomplete and retrying is refused.
- A user without `project:edit` cannot tick a checklist item; a user without `project:close` still
  cannot close even with a complete checklist — the existing permission split is untouched.
