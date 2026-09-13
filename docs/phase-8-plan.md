# Phase 8 — Client Modifications / Deviations

> **Source:** `Engineering_Consultancy_Management_System_Specification.docx` §6, row 7 of the
> end-to-end flow ("Client-requested mid-construction changes are tracked separately as
> modifications, with cost/time impact and their own approval") — see `docs/PROGRESS.md`'s roadmap
> note and `~/.claude/plans/swirling-singing-book.md` (the approved 8-phase roadmap) for how this
> fits after Phase 7.
>
> **Status:** Complete.
> **Prerequisite:** Phases 1–7 (done — see `docs/PROGRESS.md`).

---

## 1. What Phase 8 is, in one sentence

Give a project a real record of a client-requested mid-construction change — what is being asked
for, which discipline it lands on, its cost/time impact, and (optionally) the drawing revision or
site-visit observation it was raised against — tracked through the same shared approval machine
every other decision in this system already uses.

## 2. Why this next

**It's the roadmap's own next stage.** Row 7 of the end-to-end flow ("Site work happens") already
has site visits/observations/instructions/issues built (Phase 2); modifications is the one piece of
that row still missing, and it depends on nothing this codebase doesn't already have: a project
(Phase 1), an optional drawing revision (Phase 3), an optional observation (Phase 2), and the shared
approval engine (Phase 3, step 13).

**It reuses three things rather than inventing any of them.** The approval state machine
(`ApprovalStatus`/`canTransitionApproval`), the `Document.linkedType`/`linkedId` polymorphic
association (for supporting evidence), and the `planning:*` permission verbs. Nothing here is a new
primitive — the roadmap's own note calls this "a sixth consumer, not a new state machine."

## 3. Data model

### New: `Modification`

```prisma
model Modification {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  projectId String  @map("project_id") @db.Uuid
  project   Project @relation(fields: [projectId], references: [id], onDelete: Restrict)

  requestText String @map("request_text") @db.Text
  impactArea  String @map("impact_area") @db.VarChar(20)

  costImpact String? @map("cost_impact") @db.Text
  timeImpact String? @map("time_impact") @db.Text

  drawingRevisionId String?          @map("drawing_revision_id") @db.Uuid
  drawingRevision   DrawingRevision? @relation(fields: [drawingRevisionId], references: [id], onDelete: Restrict)

  observationId String?      @map("observation_id") @db.Uuid
  observation   Observation? @relation(fields: [observationId], references: [id], onDelete: Restrict)

  status String @default("DRAFT") @db.VarChar(30)

  version Int @default(1)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy String?  @map("created_by") @db.Uuid

  @@index([projectId, status])
  @@index([drawingRevisionId])
  @@index([observationId])
  @@map("modification")
}
```

`impactArea` is `ARCHITECTURE`, `STRUCTURAL` or `MEP` — a fixed triple, not a free-typed catalogue
like `Document.category`; the PRD names these three disciplines explicitly. `costImpact`/`timeImpact`
are free text, not a structured figure — the PRD gives no fixed format for either, matching how
`Issue.severity` started as a catalogue rather than a computed field.

**Both links are optional and independent.** `drawingRevisionId` and `observationId` may be set
together, one at a time, or neither — a modification can be a standalone client request with no
prior paper trail. Each is checked with the same two-hop "does this belong to the project named in
the URL" lookup `IssueService.requireObservationInProject` already uses for `Issue.observationId`.

### Status is `ApprovalStatus`, consumed directly

The same treatment `DrawingRevision` gets (docs/phase-3-plan.md §5): no extra edge the way
`Submission`'s `WITHDRAWN`/`HALTED`/`CANCELLED` are. A modification is approved, rejected, or sent
back for revision through the one shared machine — there is no "withdraw" or "cancel" concept for a
client change request in the source material, so nothing is added beyond the shared six states.

## 4. Supporting evidence — a fifth `Document.linkedType`

`DOCUMENT_LINKED_TYPES` gains `MODIFICATION` alongside the existing `ACTIVITY`, `SITE_VISIT`, `ISSUE`
and `SUBMISSION` (`packages/contracts/src/index.ts`). `DocumentService.requireLinkedRecordInProject`'s
`switch` gains one more `case`, doing the same flat `projectId` lookup the other four already do — a
modification is not a two-hop record from a document's point of view, since `Modification.projectId`
is a direct column.

## 5. Permissions

No new resource. Rides the existing `planning:view/create/edit/approve` — the same reasoning Phase 6
and Phase 7 used to avoid a permission per new project-scoped record, and the closest existing verb
set to a modification's own shape: `planning:approve` already exists and covers exactly the three
decision actions (`approve`/`reject`/`returnForRevision`) a modification needs, the same split
`SubmissionController` already draws between routine progression (`submit`/`review`, behind
`planning:edit`) and a decision.

## 6. Web

A `/projects/:id/modifications` list page — no dedicated detail page, since a modification carries
no child records the way a `Submission`'s reviews/meetings do (the same "no dedicated edit page"
reasoning `docs/PROGRESS.md`'s Phase 2 note already gives for entities whose whole mutable state is a
targeted action, not a general-purpose edit screen). The list shows the request, impact area,
cost/time impact, status, and the transition buttons legal from the row's current status — the same
per-row `ACTIONS.filter(canTransitionApproval(...))` shape the Drawings revision table uses. A create
form is inline at the bottom of the same page, following the Site Visits/Supervision precedent for a
single-record-per-submit form.

The project page gains a "Modifications" link alongside Planning/Supervision/Issues/Drawings/Documents,
gated on `planning:view` since that is the permission the whole feature rides.

## 7. Build order

| #   | Step                                                                                                                                          | Done when                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 32  | **Data model + CRUD** — `Modification` migration, `ModificationService` (list/byId/create/update), nested under `/projects/:id/modifications` | A modification can be created against a project with a request, impact area and optional cost/time impact and links; listed and edited with optimistic locking |
| 33  | **Approval + evidence** — `submit`/`review`/`approve`/`reject`/`returnForRevision` actions, `MODIFICATION` added as a `Document.linkedType`   | A modification moves through the shared `ApprovalStatus` machine the same way a drawing revision does; a document can be linked to a modification              |
| 34  | **Web** — modifications list/create page, project-page link                                                                                   | Tested through the browser: a modification is created, and moves from Draft through Submitted, Under review, to Approved                                       |

## 8. Definition of done

- A project can have a modification recorded: what the client is asking for, which discipline it
  affects, and its cost/time impact — with an optional link to a drawing revision, an observation, or
  both.
- Status moves only through the shared `ApprovalStatus` machine, the same treatment `DrawingRevision`
  already gets — no bespoke state set.
- A document can be linked to a modification, the same as it can to an activity, a site visit, an
  issue, or a submission.
- A user without `planning:view` gets nothing for any modification endpoint — the same non-member
  test every prior resource has.
- Every create, edit and status change writes an audit row.
- The project page shows a "Modifications" link wherever `planning:view` already applies — no new
  permission resource introduced.
