# Phase 2 — Core Operations

> **Source:** PRD §20, Phase 2 — _"Planning, supervision, site visits, observations, instructions and issues."_
>
> Written against the actual PRD document (`Final_PRD_Engineering_Consultancy_Management_System.docx`), not
> against secondary notes about it — `docs/architecture-discussion.md` turned out to be commentary on the PRD,
> written before the PRD itself had been located in the repository. It is accurate everywhere it was checked
> against the source, and is used below for the module boundaries it already worked out.

---

## 1. What Phase 2 is, in one sentence

The day-to-day work of running an engagement once it exists: planning activities and submissions, site visits
and what happens on them, and the issues that come out of it — everything short of the files, drawings and
formal approvals that need Phase 3's Google Drive integration to mean anything.

## 2. Scope

### In scope (PRD §6, "Planning Workflow" and "Supervision Workflow" / "Site Visits and Issues")

| Area            | What gets built                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **Planning**    | Activities and milestones; submissions and authority applications (status only, no approval step yet) |
| **Supervision** | Site visits with attendees and notes; observations; instructions with an owner and a due date         |
| **Issues**      | Severity, priority, owner, due date; `Open → In Progress → Resolved → Closed`, reopening recorded     |

### Explicitly out of scope

- **No file or photo attachments.** PRD §6 asks for "photos and evidence" on site visits and issues, but files
  live in Google Shared Drive and metadata for them is Phase 3's `documents` module. A text evidence/notes
  field stands in until then.
- **No drawings**, and **no linking to documents** — same reason, same phase.
- **No formal approval workflow.** PRD §6 asks Planning submissions to "record approval decisions, comments and
  dates," but the PRD itself defines exactly one approval state machine (§6) shared across submissions,
  drawings and documents, and puts the whole `approvals` module in Phase 3 (§20). Building a one-off approval
  step for submissions now would be the "three divergent copies of a compliance-critical rule" the architecture
  discussion already rejected (§6.4, decision A6). A submission in Phase 2 reaches `SUBMITTED` and stops there;
  Phase 3's Approvals module attaches to it without a rewrite — see §4 below for how the schema keeps that seam
  open.
- **No notifications.** PRD §9, and explicitly Phase 5.

This is the same shape of deferral Phase 1 used for documents and Drive — nothing here is guessed at; it is
named as a clean boundary and picked up on schedule.

## 3. What the PRD actually asks for (§6)

**Planning Workflow**

> Manage activities and milestones. Track submissions and authority applications. Link drawings and documents.
> Record approval decisions, comments and dates.

**Supervision Workflow**

> Create site visits with attendees and notes. Record observations and instructions. Assign owners and due
> dates. Track Open, In Progress, Resolved and Closed states. Maintain closure evidence.

**Site Visits and Issues**

> Create structured site visit records. Record observations, instructions, photos and evidence. Assign
> severity, priority, owner and due date. Track resolution and verified closure.

Two entities are described twice, in slightly different words, and that is deliberate rather than sloppy: the
**Supervision Workflow** bullets describe the visit and its contents in general; the **Site Visits and Issues**
bullets are specifically about the entity that needs the full four-state lifecycle, severity and priority — the
**Issue**. `docs/architecture-discussion.md` §6.4 already reached the same reading independently: `supervision`
owns `SiteVisit`, `Observation` and `Instruction`; `issues` is its own module, owning `Issue` alone. Phase 1's
own workflow table (`phase-1-plan.md` §5a) already reserved `Issue` as one of exactly four state machines in
the whole system — Project, Approval, Issue, Drawing revision. Observations and instructions are not on that
list, and PRD §6 never assigns them a four-state lifecycle either — the language above ("assign owners and due
dates") is closer to a simple task than to a workflow. They get a due date and a completion mark, not a
transition table.

## 4. The data model for Phase 2

Three new modules, matching `docs/architecture-discussion.md` §6.4 exactly.

### `planning`

- **`planning_activity`** — belongs to a project; name, description, assignee, due date, done/not
- **`milestone`** — belongs to a project; name, target date, achieved date
- **`submission`** — belongs to a project; reference, authority name, submitted date, status
  (`DRAFT → SUBMITTED`, plus `WITHDRAWN` from either). Phase 3's Approvals module will extend this status set
  (`UNDER_REVIEW`, `APPROVED`, `REJECTED`, `RETURNED_FOR_REVISION`) rather than replace it — `SUBMITTED` is
  where Phase 2 stops, not a dead end.

### `supervision`

- **`site_visit`** — belongs to a project; visit date, attendees, notes
- **`observation`** — belongs to a site visit; description, category
- **`instruction`** — belongs to a site visit; directive text, assignee, due date, `actioned_at`

### `issues`

- **`issue`** — belongs to a project, optionally raised from an observation; title, description, **severity**,
  **priority**, owner, due date, status, closure notes. The fourth state machine in the system:

  | From          | May become                  |
  | ------------- | --------------------------- |
  | `OPEN`        | `IN_PROGRESS`               |
  | `IN_PROGRESS` | `RESOLVED`                  |
  | `RESOLVED`    | `CLOSED`, `OPEN` (reopened) |
  | `CLOSED`      | `OPEN` (reopened)           |

  Reopening from `CLOSED` is included because PRD §6 says resolution must be "verified" before closure — a
  verification that fails has to be able to send the issue back, and that is worth being explicit about rather
  than leaving `CLOSED` terminal the way `Project.CLOSED` deliberately is. An issue's closure is not the
  historical record the way a closed project is; it is a claim that can turn out to be wrong.

All four tables get the same furniture as everything else in this codebase: UUID primary key, `created_at`,
`updated_at`, `version` for optimistic locking, and an audit row for every create, edit and status change —
refusals included, on their own transaction, exactly as steps 5 and 6 established.

## 5. The two open items from PRD §17, and proposed starting answers

Two lines of the client's own gap register (§17) land squarely in Phase 2. Both get a sensible default now,
stored as data, so the client's real answer is a migration rather than a rewrite — the same treatment Phase 1
gave the project-status list and the permission matrix.

| §17 item                                                           | Proposed default                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Site Workflow** — required visit, observation and closure fields | Nothing marked required beyond what is structurally necessary (a visit needs a date; an issue needs a title). Everything else — attendees, notes, closure evidence — is optional text. Loosening a required field later is free; making an optional one required after data exists without it is not, so this starts permissive                                                                                           |
| **Issue Management** — severity, SLA/due-date and closure rules    | Severity: `LOW, MEDIUM, HIGH, CRITICAL`. Priority: `LOW, MEDIUM, HIGH`. No SLA is enforced — a due date is recorded and can be overdue, but nothing escalates automatically, because escalation is a notification (§9), and notifications are Phase 5. Closure requires the status transition; it does not require the closure-notes field to be filled — a title-only issue closed with no notes is unusual, not invalid |

Both are catalogues, not code — adding a fifth severity or changing what counts as overdue is a data change,
the same as the project-status list in Phase 1.

## 6. Permissions

Three new resources, following the existing `<resource>:<action>` shape (`packages/contracts`):

```
planning:view, planning:create, planning:edit
supervision:view, supervision:create, supervision:edit
issue:view, issue:create, issue:edit, issue:close
```

All **PROJECT**-scoped, for the same reason `project:edit` is: this is exactly the kind of record a
non-member must get nothing for. `issue:close` is separate from `issue:edit` because PRD §3 gives it to a
specific role — **Supervision Team**'s stated responsibility is "site visits, observations, instructions and
**issue closure**", not general issue editing.

Starting matrix, seeded by migration as data (decision 3, unchanged in spirit):

| Role                 | Planning                       | Supervision                    | Issues                                |
| -------------------- | ------------------------------ | ------------------------------ | ------------------------------------- |
| System Administrator | everything, everywhere         | everything, everywhere         | everything, everywhere                |
| Director             | `view` (global)                | `view` (global)                | `view` (global)                       |
| Project Manager      | `view, create, edit` (project) | `view, create, edit` (project) | `view, create, edit, close` (project) |
| Planning Team        | `view, create, edit` (project) | `view` (project)               | `view` (project)                      |
| Supervision Team     | `view` (project)               | `view, create, edit` (project) | `view, create, edit, close` (project) |
| Document Controller  | `view` (project)               | `view` (project)               | `view` (project)                      |

This reads PRD §3 literally: Planning Team owns planning, Supervision Team owns supervision **and issue
closure**, and everyone else on a project can at least see what is happening on it. Confirmed shape, not yet
confirmed detail — same status as Phase 1's matrix (open question 5 in `docs/PROGRESS.md`), and changing a row
is one migration.

## 7. Build order

Each module ends with something that can be run and checked, same as every Phase 1 step.

| #   | Step              | Done when                                                                                                                                               |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | **Planning**      | Activities, milestones and submissions can be created, edited and listed, scoped to project membership; a submission reaches `SUBMITTED` and no further |
| 10  | **Supervision**   | Site visits, observations and instructions can be recorded against a project a caller belongs to                                                        |
| 11  | **Issues**        | The four-state machine is enforced server-side, exactly as `project` status is; a non-member gets nothing, matching the step-6 critical test            |
| 12  | **Web interface** | List/detail/create screens for all three, in the now-real PRD §18 palette                                                                               |

Step 9 (Planning) starts first: it is the only one of the three with no open business-rule question attached —
Submissions stop at `SUBMITTED` regardless of what the client eventually says about approval rules, so nothing
about it is provisional.

## 8. Definition of done

- A Planning Team member can create an activity, a milestone and a submission on a project they belong to.
- A Supervision Team member can log a site visit with an observation and an instruction.
- Severity, priority, owner and due date can be set on an issue; it moves `Open → In Progress → Resolved →
Closed`, and back to `Open` on reopening.
- A user who is not a member of a project gets nothing for any of the above — the same test as Phase 1 step 6,
  run again against three new modules.
- Every create, edit and status change writes an audit row; refusals are recorded too.
- No workflow status is ever set by a direct field write — only through a named transition, validated
  server-side, the same rule Phase 1 §5a established for every state machine in the system.

## 9. What's already resolved, so this doesn't wait

- **Approval rules (§17 "Approval Rules")** — sidestepped for Phase 2 entirely, by design (§2, §4 above), not
  answered. It becomes a real question again in Phase 3.
- **Palette (§18)** — resolved mid-session; the actual PRD document was located and the real eight colours are
  now in `apps/web/src/app/globals.css`. No longer an open question.
