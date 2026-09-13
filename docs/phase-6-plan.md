# Phase 6 — Authority Application Tracking

> **Source:** `Engineering_Consultancy_Management_System_Specification.docx` (the detailed brief, not the
> condensed Final PRD) §4/§29 on Municipality and Ministry of Housing review stages, cross-checked against
> `11 Drawings Final.xlsx` — the real drawing register staff run today, whose `Status` column shows values
> (`MOH`, `Krookie`, `Owner`, `Halted`, `Cancelled`) the current `Submission.status` enum does not model.
> See `docs/PROGRESS.md`'s roadmap note and `~/.claude/plans/swirling-singing-book.md` (the approved 8-phase
> roadmap) for how this fits after Phase 5.
>
> **Status:** Complete — see `docs/PROGRESS.md` Steps 25-28.
> **Prerequisite:** Phases 1–5 (done — see `docs/PROGRESS.md`).

---

## 1. What Phase 6 is, in one sentence

Give a `Submission` (already a real, working record — Phase 3, Step 13) a place to hold the back-and-forth
of an actual government review — reviews, meetings, clarifications, a permit reference — instead of only a
single status column and a free-text `notes` field.

## 2. Why this next

**It extends what already exists rather than sitting next to it.** Row 4 of the roadmap's end-to-end flow
("Sent to government") names this as the next unbuilt stage after Phase 5's convert action produces a real
`Project`, and before Phase 7's Supervision Agreements. `Submission` (`schema.prisma:346`) already carries
`reference`, `authorityName`, the shared approval status machine (`SUBMISSION_STATUSES` in
`packages/contracts/src/index.ts:820`), and its own `WITHDRAWN` edge — this phase adds children and a few
columns to that same table, the same way Phase 3's Drawings added `DrawingRevision` as a child of `Drawing`
rather than inventing a new top-level entity.

**The real register proves the gap is not hypothetical.** `11 Drawings Final.xlsx`'s `Status` column shows
values that don't fit today's single enum at all — some look like genuine authority-review states, others
look like they belong to a different lifecycle entirely (see §3 and the open question this plan does not
resolve).

**`DrawingRevision` already proved the exact shape needed.** A one-to-many child off a parent row, each
child carrying its own `status`/dates/notes, ordered by creation — this phase's `SubmissionReview` and
`SubmissionMeeting` are two more instances of that shape, not a new pattern.

## 3. What the real register shows — and what it does not resolve

`11 Drawings Final.xlsx`'s `Status` column contains, among ordinary progress values, `MOH`, `Krookie`,
`Owner`, `Halted`, `Cancelled`. Before this plan proposes any schema change to `Submission.status` itself,
it is worth being explicit about why none of the model below depends on resolving what these mean:

- `MOH` (Ministry of Housing) and `Owner` read like **who the ball is currently with**, not a review
  outcome — closer to an `authorityName`/party value than a status.
- `Krookie` (the survey plan, already modeled on `Property` since Phase 4) reads like it may be a
  **drawing-specific** waiting state (waiting on a survey document) rather than an authority-application
  state at all.
- `Halted`/`Cancelled` read like genuine terminal states a submission can reach that
  `SUBMISSION_STATUSES` does not have today (only `WITHDRAWN` exists as a non-`REJECTED` dead end).

**This plan deliberately does not widen `SUBMISSION_STATUSES` to absorb these values.** Doing so without
client confirmation risks conflating "which party we're waiting on" with "what state the submission is in"
— exactly the same mistake Phase 5 avoided by keeping `Proposal.source` and `Proposal.status` as two
separate fields (`phase-5-plan.md` §5b) rather than one overloaded column. Instead:

- **"Who the ball is with"** becomes a new `Submission.pendingWith` free-text/enum-lite field (§4), not a
  status value — modeled on the same instinct that kept `Proposal.source` separate from `Proposal.status`.
- **`Halted`/`Cancelled`** are a real gap in `SUBMISSION_STATUSES` and are added as two new terminal edges
  (§4) — this part does not need client confirmation; a submission that has genuinely stopped moving is a
  status, the same category `WITHDRAWN` already is.
- **`Krookie`** as a submission state is left alone. If it turns out to be drawing-specific, it already has
  nowhere to live on `Submission` and shouldn't get one speculatively.

The open question carried over from the roadmap (`swirling-singing-book.md`) is narrowed, not resolved, by
this reasoning — see §9.

## 4. Data model

### `Submission` — new columns, no structural change

```
model Submission {
  // ...existing fields unchanged...

  /// PLANNING or HOUSING — which authority this application is with. Distinct
  /// from `authorityName` (a free-text label like "Muscat Municipality"):
  /// this is the fixed pair spec §4/§29 actually distinguishes, and is what
  /// a review/meeting child row is filed under.
  department String @default("PLANNING") @map("department") @db.VarChar(20)

  /// Free text describing who currently holds the ball — client, MoH,
  /// Municipality, the consultancy itself — the real register's "MOH"/
  /// "Owner" values, kept separate from `status` for the same reason
  /// `Proposal.source`/`Proposal.status` are separate (phase-5-plan.md §5b).
  pendingWith String? @map("pending_with") @db.VarChar(100)

  /// Set only once, the moment `status` reaches APPROVED via the dedicated
  /// action (§5) — never editable afterwards, the same immutability
  /// `DrawingRevision`'s approved state already gives a revision's content.
  permitReference String? @map("permit_reference") @db.VarChar(100)

  clarificationRequested   Boolean   @default(false) @map("clarification_requested")
  clarificationRequestedAt DateTime? @map("clarification_requested_at") @db.Timestamptz(6)
  clarificationResponse    String?   @map("clarification_response") @db.Text
  clarificationRespondedAt DateTime? @map("clarification_responded_at") @db.Timestamptz(6)

  reviews  SubmissionReview[]
  meetings SubmissionMeeting[]
}
```

### New: `SubmissionReview` — one row per authority review round

```
model SubmissionReview {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  submissionId String     @map("submission_id") @db.Uuid
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Restrict)

  reviewDate      DateTime  @map("review_date") @db.Date
  reviewerName    String?   @map("reviewer_name") @db.VarChar(200)
  comments        String?   @db.Text
  responseDueAt   DateTime? @map("response_due_at") @db.Date
  responseText    String?   @map("response_text") @db.Text
  respondedAt     DateTime? @map("responded_at") @db.Timestamptz(6)

  version Int @default(1)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy String?  @map("created_by") @db.Uuid

  @@index([submissionId])
  @@map("submission_review")
}
```

### New: `SubmissionMeeting` — one row per authority meeting

```
model SubmissionMeeting {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  submissionId String     @map("submission_id") @db.Uuid
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Restrict)

  required   Boolean   @default(false)
  meetingAt  DateTime? @map("meeting_at") @db.Timestamptz(6)
  attendees  String?   @db.Text
  purpose    String?   @db.Text
  outcome    String?   @db.Text
  heldAt     DateTime? @map("held_at") @db.Timestamptz(6) // set once the meeting has actually happened

  version Int @default(1)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy String?  @map("created_by") @db.Uuid

  @@index([submissionId])
  @@map("submission_meeting")
}
```

Both children follow `DrawingRevision`'s posture exactly: never deleted (a review or meeting that happened
is a fact, the same reasoning `schema.prisma:374`'s comment already gives for `SiteVisit`), optimistic-locked
with their own `version`, and audited the same way every other write in this codebase is.

### Status machine — two new terminal edges, not a new machine

```
export const SUBMISSION_STATUSES = [...APPROVAL_STATUSES, 'WITHDRAWN', 'HALTED', 'CANCELLED'] as const;

export const SUBMISSION_TRANSITIONS = {
  DRAFT:                 [...APPROVAL_TRANSITIONS.DRAFT, 'WITHDRAWN'],
  SUBMITTED:             [...APPROVAL_TRANSITIONS.SUBMITTED, 'WITHDRAWN', 'HALTED'],
  UNDER_REVIEW:          [...APPROVAL_TRANSITIONS.UNDER_REVIEW, 'HALTED'],
  APPROVED:              [...APPROVAL_TRANSITIONS.APPROVED],
  REJECTED:              [...APPROVAL_TRANSITIONS.REJECTED],
  RETURNED_FOR_REVISION: [...APPROVAL_TRANSITIONS.RETURNED_FOR_REVISION, 'HALTED'],
  WITHDRAWN:             [],
  HALTED:                ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'], // resumable, unlike WITHDRAWN
  CANCELLED:             [],
} as const satisfies Record<SubmissionStatus, readonly SubmissionStatus[]>;
```

`HALTED` is deliberately resumable (the real register's own halted entries are not necessarily dead —
"paused pending X" is the plain reading of a halt) while `WITHDRAWN`/`CANCELLED`/terminal approval states
stay dead ends, matching the existing table's own asymmetry between `WITHDRAWN` (dead) and
`RETURNED_FOR_REVISION` (alive).

New actions in `SUBMISSION_ACTIONS`: `halt` → `HALTED`, `resume` → back to whichever of
`SUBMITTED`/`UNDER_REVIEW` the caller names (mirrors Phase 5's own `start-concept`/"resume" resolution,
`docs/PROGRESS.md` Step 24 — one route, the transition table decides legality from wherever the submission
actually is), `cancel` → `CANCELLED`.

### `approve` action — gains a required `permitReference`

The existing `approve` action (`SUBMISSION_ACTIONS.approve`) is extended so `POST
/submissions/:id/approve` requires `permitReference` in its body when the target department is `HOUSING`
or when the submission has no existing one — refused by name ("A permit reference is required to approve
this submission.") the same way Phase 5's convert action refuses a missing property, not a generic
validation error. `Submission.permitReference` is set in the same transaction as the status write and never
editable afterward through the plain `update` endpoint (mirrors `DrawingRevision`'s "approved content is
immutable" rule).

### Clarification flow — two actions, not a status

`POST /submissions/:id/request-clarification` sets `clarificationRequested = true`,
`clarificationRequestedAt = now()` — this does **not** change `status`; a submission under review that
needs clarification is still `UNDER_REVIEW`, just with a flag raised, the same reason `Modification`
(Phase 8) will route through the shared approval engine rather than invent a parallel status. `POST
/submissions/:id/respond-clarification` records `clarificationResponse`/`clarificationRespondedAt` and
clears the flag. Both are ordinary authenticated actions requiring `submission:edit`, audited as
`UPDATED`, not `STATUS_CHANGED`.

## 5. Reviews and meetings — CRUD, not a state machine

`SubmissionReview` and `SubmissionMeeting` are records of things that happened or are scheduled to happen,
not entities with their own lifecycle — create/list/update (optimistic-locked via `version`, same pattern
as `Submission.update`), no transition table. `SubmissionReviewService`/`SubmissionMeetingService` follow
`SubmissionService`'s own shape: `list(submissionId, query)`, `byId`, `create`, `update` — each scoped to
the parent submission the same way `SubmissionService` is scoped to its parent project
(`requireOpenProject` reused unchanged).

## 6. Permissions

No new top-level resource — reviews and meetings are always accessed through their parent submission, so
they ride the existing `submission:*` verbs rather than getting their own:

- `submission:view`, `submission:create`, `submission:edit` (existing) now also gate
  `SubmissionReview`/`SubmissionMeeting` list/create/update.
- The existing submission-transition permission (whatever currently gates `POST
/submissions/:id/:action`) additionally gates `halt`/`resume`/`cancel`/`request-clarification`/
  `respond-clarification` — no new verb, since these are all the same "move this submission along" action
  category the existing actions already sit in.

Project-scoped, unchanged — a submission's own project membership already decides who may touch it.

## 7. Search

No change to `PropertyService`-style search scope. `SubmissionService.list`'s existing search
(`reference`, `authorityName`) is untouched by this phase; reviews/meetings are found only by listing under
their parent, not searched independently — they have no register of their own in the real world either.

## 8. Build order

| #   | Step                                                                                                                                                                                                                                                                                                      | Done when                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25  | **Schema + new statuses** — migration adding `department`, `pendingWith`, `permitReference`, clarification columns to `Submission`; `SubmissionReview`/`SubmissionMeeting` tables; `HALTED`/`CANCELLED` added to `SUBMISSION_STATUSES`/`SUBMISSION_TRANSITIONS`/`SUBMISSION_ACTIONS` in `@ecms/contracts` | A submission can be halted and resumed, or cancelled, through a named action; every non-listed transition is refused server-side, proven the same way `PROJECT_TRANSITIONS` already is |
| 26  | **Reviews & meetings CRUD** — `SubmissionReviewService`/`SubmissionMeetingService`, controllers nested under `/submissions/:id/reviews` and `/submissions/:id/meetings`                                                                                                                                   | A review or meeting can be logged against a submission, listed in creation order, and edited with optimistic-lock protection, each producing an audit row                              |
| 27  | **Approve-requires-permit + clarification actions** — `approve` extended to require `permitReference`; `request-clarification`/`respond-clarification` endpoints                                                                                                                                          | Approving without a permit reference is refused by name; a clarification request/response round-trips without changing `status`                                                        |
| 28  | **Web** — submission detail page gains a reviews/meetings sub-list (create/edit inline, clients-page pattern), a permit-reference field on the approve form, and clarification request/respond buttons                                                                                                    | Tested through the browser, matching the existing Playwright pattern from Steps 12/16/20/24                                                                                            |

## 9. Definition of done

- A submission can record any number of reviews and meetings, each with its own date, notes and outcome,
  none of them deletable once created.
- A submission can be halted and later resumed, or cancelled outright, through named actions — not a bare
  status edit — with every transition checked against the shared table the same way every prior status
  column in this system already is.
- Approving a submission without a `permitReference` is refused, by name, not a generic error; the
  reference is recorded once and never silently overwritten afterward.
- A clarification request/response round-trips without disturbing the submission's own `status`.
- A user without `submission:view` gets nothing for any review/meeting endpoint under it — the same
  non-member/no-permission test every prior resource has.
- Every create, edit, and transition on a submission, review, or meeting writes an audit row.
- `Krookie`, `MOH`, `Owner` from the real register are deliberately not modeled as submission statuses in
  this phase (see §3) — `pendingWith` covers the "who has it" reading without overloading `status`, and
  `HALTED`/`CANCELLED` cover the two states that were genuinely missing.

## Open question to take back to the client (unchanged from the roadmap, narrowed by §3)

Confirm whether `Krookie` in the real drawing register ever describes an authority-application state (as
opposed to "waiting on the survey document," which already has nowhere to go but `Property.surveyReference`
since Phase 4) — before any future phase considers giving it a place on `Submission`. This plan does not
block on the answer: it ships `HALTED`/`CANCELLED` and `pendingWith` regardless, and leaves `Krookie`
alone either way.
