# Phase 3 — Documents

> **Source:** PRD §20, Phase 3 — _"Document register, drawing revisions, Google Shared Drive and approvals."_
>
> Written against the actual PRD document (`Final_PRD_Engineering_Consultancy_Management_System.docx`) and
> `docs/architecture-discussion.md` §6.4–6.5, §7.3 and §9 (decisions A3, A5, A6; open questions B3, B4, B6, B7;
> risk D2) — the parts of that document phase-1 and phase-2 deliberately left for this phase.

---

## 1. What Phase 3 is, in one sentence

Controlled files: a document register and an immutable drawing-revision history, both backed by metadata in
this database and bytes in Google Shared Drive, plus the one approval workflow the PRD defines once (§6) and
this plan reuses rather than reimplementing per module.

## 2. Scope

### In scope (PRD §6 "Drawing and Revision Control", "Document Management", "Approvals"; §7)

| Area          | What gets built                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| **Drawings**  | Drawing register; append-only revisions; exactly one current revision; approved revisions never edited   |
| **Documents** | Document register; metadata linked to projects and, optionally, other Phase 1/2 records; access history  |
| **Approvals** | One shared status set and transition table, consumed by submissions (Phase 2) and drawing revisions      |
| **Drive**     | The upload/download seam described below — built now, wired to a real Google account when B7 is answered |

### Explicitly out of scope

- **No real Google Drive account yet.** This environment has no Google Cloud project, service account or
  Drive API credentials, and B7 (§6 below) is unanswered. The seam is built to the shape architecture
  discussion §6.5 specifies — a `DriveAdapter` port — with a local stub behind it, so the document register,
  the pending→active state machine and every permission check can be built and tested now. Swapping in the
  real adapter is a Phase 3 follow-up, not a rewrite, the same relationship Phase 2 gave Phase 3's approvals.
- **No reconciliation job.** Architecture discussion §6.5 and PRD §7 ask for one to catch orphaned metadata
  and orphaned files. It has nothing to reconcile against without a real Drive account, so it is designed for
  (the `pending`/`active` states it needs already exist) but not scheduled until one exists.
- **No handover or closure work.** PRD §20 puts that in Phase 4.
- **No client/external stakeholder access.** Confirmed out of scope in architecture-discussion §10; the trust
  boundary is designed to admit it later, unchanged here.

## 3. What the PRD actually asks for (§6, §7)

**Drawing and Revision Control**

> Register drawing metadata. Maintain revision history without overwriting approved versions. Identify current
> active revision. Clearly mark superseded versions.

**Document Management**

> Store metadata in the application database. Store actual files in Google Shared Drive. Link documents to
> projects, activities, visits, approvals and issues. Maintain revision and access history.

**Approvals**

> Support Draft, Submitted, Under Review, Approved, Rejected and Returned for Revision. Record approver, date
> and comments. Enforce approval permissions.

**Google Shared Drive Integration (§7)**

> The application database stores business metadata. Google Shared Drive stores the actual engineering files.
> ... Use predictable project and document folder conventions. Store Google Drive file IDs for reliable
> linking. Do not duplicate large engineering files inside PostgreSQL. Log integration failures and support
> safe retries.

## 4. Approvals — one shared implementation, not three

Architecture discussion §6.4 (decision A6) asks for a **single reusable approval state machine**, not
per-workflow duplication, because the PRD defines exactly one (§6) used across submissions, drawings and
documents. This codebase's own idiom, though, is a shared **transition table and function in
`@ecms/contracts`**, not a shared database table — `PROJECT_TRANSITIONS`, `SUBMISSION_TRANSITIONS` and
`ISSUE_TRANSITIONS` each already live this way, checked by the module that owns the status column. Approvals
get the same treatment, which is what "one implementation" means in this codebase: one place the _rule_ lives,
not one denormalised table joining three unrelated entities.

```
APPROVAL_STATUSES = DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, RETURNED_FOR_REVISION
```

| From                    | May become                                      |
| ----------------------- | ----------------------------------------------- |
| `DRAFT`                 | `SUBMITTED`                                     |
| `SUBMITTED`             | `UNDER_REVIEW`                                  |
| `UNDER_REVIEW`          | `APPROVED`, `REJECTED`, `RETURNED_FOR_REVISION` |
| `APPROVED`              | _(nothing — terminal, like `Project.CLOSED`)_   |
| `REJECTED`              | _(nothing — terminal)_                          |
| `RETURNED_FOR_REVISION` | `SUBMITTED`                                     |

This is phase-1-plan.md §5a's `Approval` row, unchanged.

**Consumers, not copies:**

- **`Submission` (Phase 2, `planning` module)** — its status column grows from `{DRAFT, SUBMITTED,
WITHDRAWN}` to the full approval set plus `WITHDRAWN`, exactly as `docs/phase-2-plan.md` §4 promised:
  _"Phase 3's Approvals module will extend this status set... rather than replace it."_ `WITHDRAWN` is
  reachable from `DRAFT` or `SUBMITTED` only, layered on top of the shared table, not inside it — a
  submission-specific edge the shared approval flow has no reason to know about.
- **`DrawingRevision` (new, `drawings` module)** — uses `APPROVAL_STATUSES`/`canTransitionApproval` directly,
  with no extra edge. A revision that reaches `APPROVED` becomes immutable (§5 below); one that is `REJECTED`
  or `RETURNED_FOR_REVISION` blocks nothing — the drawing simply waits for the next revision.
- **`Document`** — deliberately **not** run through the approval state machine in this phase. PRD §6 mentions
  approvals "across submissions, drawings and documents," but most documents this system will hold — site
  photographs, reports, correspondence — have no approval step in practice, and forcing one onto every
  uploaded file is exactly the complexity PRD §22 asks to avoid until the business needs it. A document's own
  register is a simple, unapproved record; if a specific category turns out to need sign-off, that is a
  narrow, later addition, not a reason to gate every document behind a workflow today.

**The one genuinely open question this raises (§6 below, B3):** whether the person who submitted or created
something may also approve it. The starting default is **no** — `approve` is refused when the actor matches
the record's `createdBy`, checked in the service layer next to the permission check, the same place
`requireOpenProject` already sits. Easy to loosen; the reverse (discovering self-approval happened by accident)
is not.

## 5. Drawings — the strictest invariant in the system

Architecture discussion §7.3 and decision A3: drawing revisions are append-only, and an approved revision must
be immutable even against a bug, a bad migration, or someone with direct database access. This is the first
invariant in the whole system enforced by a **database trigger** rather than application code alone — every
other rule so far (privilege separation on `audit_entry`, CHECK constraints on status columns) has been a grant
or a constraint; this one needs a trigger because "reject this specific UPDATE only when a flag is set"
cannot be expressed as either.

```
model Drawing {
  id, projectId, number, title
  currentRevisionId  -- nullable until the first revision exists
}

model DrawingRevision {
  id, drawingId, revisionCode      -- "P1", "P2", "C1"... — see B4 below
  status            -- APPROVAL_STATUSES, this module's own transition checks
  fileId            -- Drive file id, once uploaded; null while pending (§7 below)
  supersededAt      -- set the instant a LATER revision is created, never earlier
  version, createdAt, createdBy
}
```

- **Exactly one current revision per drawing** — a partial unique index on `(drawingId) WHERE superseded_at IS
NULL`, the same technique clients and properties already use for archived-row uniqueness (`phase-1-plan.md`
  step 5), pointed at the opposite condition.
- **The trigger**: `BEFORE UPDATE OR DELETE ON drawing_revision, WHEN (OLD.status = 'APPROVED')` raises an
  exception unless the only column changing is `superseded_at` — an approved revision may be superseded by a
  newer one arriving, but nothing about the approved revision itself may change, ever. This is the one rule in
  the system that a Prisma `update()` call cannot be trusted to respect on its own, so the database is asked to
  refuse it regardless of what application code does.
- **A new revision does not replace the old one.** Uploading "P2" creates a new `DrawingRevision` row, sets the
  previous current row's `supersededAt`, and updates `Drawing.currentRevisionId` — three writes in one
  transaction, the same shape `Project.transition` already uses for a conditional status move.

## 6. Documents

```
model Document {
  id, projectId, category      -- catalogue, not enum — see B6 below
  title, description
  fileId                       -- Drive file id, once uploaded
  uploadStatus                 -- PENDING, ACTIVE, FAILED — see §7
  linkedType, linkedId         -- optional: 'ACTIVITY' | 'SITE_VISIT' | 'ISSUE' | 'SUBMISSION', matching PRD §6
                                    "Link documents to projects, activities, visits, approvals and issues"
  version, createdAt, createdBy
}
```

`linkedType`/`linkedId` is a plain nullable pair, not a foreign key — a document can point at a record in any
of four different tables across three modules, and a real foreign key would need one nullable column per
target type or a check the database cannot express cleanly. The same trade `PlanningActivity.assigneeId` and
`Issue.ownerId` already make (no FK, checked at the point of use) applies here: the service layer verifies the
linked record exists and belongs to the same project before writing, the same `requireXInProject` shape every
Phase 2 module already uses.

## 7. Google Drive integration — what is built now, and what waits on B7

Architecture discussion §6.5 (decision A5) is adopted as designed: a service account owns the whole project
folder tree, end users hold no Drive permissions directly, and every file access is brokered by the
application. The write flow it specifies — create `pending`, upload bytes, mark `active` with the file ID — is
exactly `Document.uploadStatus` above.

**What is genuinely blocked:** this sandbox has no Google Cloud project, no service account, and no Drive API
credentials, and B7 — the authentication model itself, and whether anyone edits the Drive tree by hand outside
the application — is still unanswered by the client (`architecture-discussion.md` §9B, carried forward from
Phase 1's own open-questions list). Building against a live Drive account is not possible here regardless of
which answer arrives.

**What is not blocked, and is built regardless of the answer:**

```
interface DriveAdapter {
  upload(fileBuffer, path): Promise<{ fileId: string }>
  download(fileId): Promise<Buffer>
  delete(fileId): Promise<void>
}
```

- A `LocalDriveAdapter` — writes to a directory on disk, returns a fabricated-but-stable file id — implements
  this port for local development and for every integration test in this phase. Every document and drawing
  route, every permission check, and the whole `pending → active` transaction shape can be built, exercised
  and reviewed against it.
- The real `GoogleDriveAdapter` is a second implementation of the same interface, added once B7 is answered and
  credentials exist. Nothing above the adapter — the controllers, the services, the pending/active state
  machine, the permission model — changes when it arrives. This is the same seam relationship Phase 2 gave
  Phase 3's approvals: build the part that is knowable now, leave an interface the unknown part attaches to
  without a rewrite.
- The reconciliation job architecture discussion §6.5 asks for stays a stub — a scheduled task with nothing
  real to reconcile against is dead code, not a feature. Its shape (find `pending` rows past a deadline; find
  `active` rows whose file id 404s) is written once the real adapter exists to actually fail in the ways it is
  meant to catch.

## 8. The open items from PRD §17 that land in Phase 3, and proposed starting answers

Four of architecture-discussion §9B's business questions are Phase 3's to carry, matching the treatment every
earlier open item in this project has had: a sensible default, stored as data or a narrow rule, so the
client's real answer is a migration or a small change rather than a rewrite.

| §17 / §9B item                                                                   | Proposed default                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B3 — Approval rules**: single/multi-step, delegation, self-approval            | Single-step (`UNDER_REVIEW → APPROVED/REJECTED/RETURNED_FOR_REVISION` directly, no intermediate reviewer stage). No delegation. **Self-approval refused** — see §4 above. All three are the narrowest reading of the PRD's own status list, easy to loosen             |
| **B4 — Drawing naming / revision numbering**                                     | `revisionCode` is a free-text field the caller supplies (`"P1"`, `"C1"`, `"Rev A"`...), not a derived sequence — the PRD gives no convention, and deriving one that turns out wrong is harder to unwind than accepting free text and validating uniqueness per drawing |
| **B6 — Document categories, required metadata, Shared Drive folder conventions** | `category` is a free-text catalogue field, not a fixed enum, matching how `Issue.severity` started (§ phase-2-plan §5). Folder conventions are an adapter-level concern (§7 above) and do not need answering to build the register itself                              |
| **B7 — Google Drive authentication model; manual out-of-band edits**             | Answered as: **not resolved, and not blocking.** §7 above is exactly the design that keeps it from blocking                                                                                                                                                            |

## 9. Permissions

Three new resources, and the first real use of the `approve` verb PRD §8 named in step 4 but nothing has
needed until now:

```
drawing:view, drawing:create, drawing:approve
document:view, document:create, document:edit, document:archive
planning:approve      -- new verb on the existing resource; a submission is already planning's
```

`planning:approve` sits on the existing `planning` resource rather than inventing an `approval` resource,
matching how `issue:close` already sits on `issue` rather than a separate `closure` resource — the verb
belongs to the thing it governs.

Starting matrix, seeded by migration as data, read from PRD §3's own role descriptions rather than guessed —
`PLANNING`'s own description already says "submissions, drawings **and approvals**", and `DIRECTOR`'s says
"dashboards **and approvals**":

| Role                 | Planning (new)      | Drawings                 | Documents                               |
| -------------------- | ------------------- | ------------------------ | --------------------------------------- |
| System Administrator | `approve` (global)  | everything (global)      | everything (global)                     |
| Director             | `approve` (global)  | `view, approve` (global) | `view` (global)                         |
| Project Manager      | —                   | `view, create` (project) | `view, create, edit` (project)          |
| Planning Team        | `approve` (project) | `view, create` (project) | `view` (project)                        |
| Supervision Team     | —                   | `view` (project)         | `view` (project)                        |
| Document Controller  | —                   | `view` (project)         | `view, create, edit, archive` (project) |

Self-approval is refused regardless of which of these a person holds — the matrix says who may approve
_something_, not whose.

## 10. Build order

| #   | Step              | Done when                                                                                                                                  |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 13  | **Approvals**     | `Submission.status` reaches `APPROVED`/`REJECTED`/`RETURNED_FOR_REVISION`; self-approval is refused; every transition audited              |
| 14  | **Drawings**      | A drawing's revisions are append-only; exactly one current revision; an approved revision resists every write, including a direct `UPDATE` |
| 15  | **Documents**     | A document can be created against the `LocalDriveAdapter`, linked to an activity/visit/issue/submission on the same project, and read back |
| 16  | **Web interface** | List/detail/create screens for all three, plus the drawing-revision timeline view                                                          |

Approvals first: it needs no new table and no Drive dependency, and it is what makes Phase 2's submissions
stop being stuck at `SUBMITTED`. Drawings second, because its trigger is the highest-risk piece of database
work in the project and deserves the same "slow down and review" treatment step 6 got. Documents third,
against the adapter §7 already specifies. The web interface last, as it was in both earlier phases.

## 11. Definition of done

- A submission moves through the full approval lifecycle, including being returned for revision and
  resubmitted, and self-approval is refused.
- A drawing's second revision supersedes its first without deleting or editing it; an attempt to `UPDATE` an
  approved revision is refused **by the database**, not only by the application, verified the same way step 7
  re-proves the audit privilege on every environment setup.
- A document can be registered, uploaded through the `LocalDriveAdapter`, linked to a record in another
  module on the same project, and downloaded back byte-for-byte.
- A user who is not a member of a project gets nothing for any of the above — the same test every phase has
  run since step 6.
- Every create, edit, approval decision and revision writes an audit row; refusals are recorded too.
- No drawing revision or document upload can be created on a closed project, matching every other module.

## 12. What's already resolved, so this doesn't wait

- **Module boundaries** — `drawings` and `documents` as separate modules, per architecture-discussion §6.4:
  drawing revisions carry the strictest invariant in the system and should not be diluted by general document
  handling.
- **The Drive integration risk (D2)** — addressed structurally by the adapter seam in §7, not by waiting for
  B7. Building stops being blocked on an external account that does not exist yet.
- **Hosting (B12/D9)** — architecture discussion flagged this as needing resolution "before Phase 3." It
  remains undecided, and nothing in this plan depends on it: the `LocalDriveAdapter` needs only a filesystem,
  and no part of Phase 3 as scoped here needs background jobs, a queue, or a specific host. It becomes load-bearing
  only when the reconciliation job (§7) is built, which is itself deferred.
