# Manual onboarding walkthrough

A step-by-step guide for exercising the whole system by hand — screen by
screen, field by field — starting from a brand-new client walking in the
door, through every module, to project closure. Written for manual testing:
no script required, every field has a sample value, every action names the
resulting state change, and every file upload point is called out
explicitly.

This assumes you are signed in as an existing administrator account.

---

## Stage 0 — Sign in

Use your existing admin account. No fields to fill — this just gets you a
session so every screen below is reachable.

---

## Stage 1 — Proposal (first contact / inquiry)

Screen: **Proposals → New**

This is where a brand-new client normally starts: an inquiry, before a
formal Client record even exists. `clientId`/`propertyId` are **both
optional** here on purpose.

| Field | Sample value |
|---|---|
| contactName *(required)* | `Ahmed Al Rawahi` |
| contactPhone | `+968 9911 2233` |
| clientId | *(leave blank — client doesn't exist yet)* |
| propertyId | *(leave blank)* |
| sketchTypeId | pick "Villa - G+1" from the dropdown (admin-configured list) |
| projectType | `BOTH` |
| approxAreaSqm | `380` |
| source | `walk-in` |
| assignedArchitectId | *(pick yourself from the user list)* |
| receivedAt | `2026-09-18` |
| dueAt | `2026-10-02` |
| notes | `First-time client, wants villa + supervision.` |

`sketchNumber` is **not** a field you fill — the server auto-generates it
(e.g. `26-SB-142`) the moment you save.

**State after save:** `proposal.status = NEW`

---

## Stage 2 — Move the proposal forward

Screen: the proposal you just opened.

Click each button in order — each is a real state change, not just a label:

| Action | State change |
|---|---|
| Click **Start Concept** | `NEW → CONCEPT` |
| Click **Send for Client Review** | `CONCEPT → CLIENT_REVISION` |
| Click **Approve** | `CLIENT_REVISION → APPROVED` |
| Click **Win** | `APPROVED → WON` |

At `WON`, before you can convert, the proposal needs a `propertyId` — which
needs a Client and a Property to exist. That's Stage 3 below.

---

## Stage 3 — Client

Screen: **Clients → New**

| Field | Sample value |
|---|---|
| name *(required)* | `Al Rawahi Family Trading LLC` |
| reference | `CL-2026-014` |
| notes | `Onboarded from proposal 26-SB-142.` |

**State after save:** a new `client.id` exists — copy it, you'll need it
below. Nothing points at it yet.

---

## Stage 4 — Contact

Screen: **Client detail → Contacts tab → New**

| Field | Sample value |
|---|---|
| name | `Ahmed Al Rawahi` |
| position | `Owner` |
| email | `ahmed.alrawahi@example.com` |
| phone | `+968 9911 2233` |
| isPrimary | `true` |

Links to the client automatically (you're inside the client's page). Only
one contact per client may have `isPrimary = true` — the form enforces it.

---

## Stage 5 — Property

Screen: **Client detail → Properties tab → New**

| Field | Sample value |
|---|---|
| name | `Al Amerat Villa Plot` |
| reference | `PR-2026-014` |
| addressLine1 | `Way 4512, Al Amerat` |
| addressLine2 | `Behind Al Amerat Park` |
| city | `Muscat` |
| postcode | `133` |
| country | `Oman` |
| plotNumber *(Krookie's own plot number)* | `1-20-041-02-233` |
| wilayat | `Al Amerat` |
| village | `Al Amerat` |
| surveyReference *(Krookie's survey serial)* | `1-20-041-02-233` |
| titleDeedReference *(Mulkia deed reference)* | `2020/08842` |
| ownerName | `Ahmed Al Rawahi` |
| ownerNationalId | `23456789` |

**State after save:** property belongs to the client from Stage 3. Now go
back to the Stage 2 proposal and click **Convert** — pick this property when
prompted.

---

## Stage 6 — Convert proposal → project

Back on the proposal from Stages 1–2.

Click **Convert**, select `propertyId = <the property from Stage 5>`.

**State change:** `proposal.status: WON → CONVERTED`, and
`proposal.convertedProjectId` is now set to a brand-new Project's id. That
new project already carries:

| Field | Value |
|---|---|
| clientId | Stage 3 client |
| propertyId | Stage 5 property |
| type | `BOTH` *(copied from proposal.projectType)* |
| status | `DRAFT` |
| code | auto-generated, e.g. `PRJ-2026-0037` |

**Side effect (automatic, nothing to fill in):** a PLANNING workstream and a
SUPERVISION workstream are both opened on this project immediately, because
`type = BOTH`.

---

## Stage 7 — Activate the project

Screen: **Project detail**

Click **Activate**.

**State change:** `project.status: DRAFT → ACTIVE`

(Other buttons here — Hold/Complete/Close — are for later in the project's
life; DRAFT projects must be activated before most other actions unlock.)

---

## Stage 8 — Add yourself as a project member

Screen: **Project → Members tab**

| Field | Sample value |
|---|---|
| userId | your own user id |
| roleCode | `PROJECT_MANAGER` |

Why this matters: your global role (e.g. `SYSTEM_ADMINISTRATOR`) says WHAT
you may do anywhere; this membership row says WHERE — without it, a
non-admin role would be refused access to this specific project.

---

## Stage 9 — Planning workstream

Screen: **Project → Planning tab**

### 9a. Planning activity → New

| Field | Sample value |
|---|---|
| name | `Prepare concept design` |
| description | `Initial concept design for client review.` |
| assigneeId | your user id |
| dueDate | `2026-10-15` |

No status field — this is a plain checkbox (`done`), ticked later by hand.

### 9b. Milestone → New

| Field | Sample value |
|---|---|
| name | `Municipality submission` |
| targetDate | `2026-11-01` |

`achievedDate` stays empty until you tick it off when actually reached.

### 9c. Submission → New (the actual authority application)

| Field | Sample value |
|---|---|
| reference | `SUB-2026-014` |
| authorityName | `Al Amerat Municipality` |
| department | `PLANNING` |
| pendingWith | `consultancy` |
| notes | `Initial villa submission.` |

**State after save:** `submission.status = DRAFT`

### 9d. Move the submission forward, one button per state

| Action | State change |
|---|---|
| Click **Submit** | `DRAFT → SUBMITTED` |
| Click **Review** | `SUBMITTED → UNDER_REVIEW` |

### 9e. Submission → Reviews tab → New (log what the authority came back with)

| Field | Sample value |
|---|---|
| reviewDate | `2026-09-25` |
| reviewerName | `Municipality Reviewer` |
| comments | `Requested clarification on setback distances.` |
| responseDueAt | `2026-10-05` |

### 9f. Submission → Meetings tab → New

| Field | Sample value |
|---|---|
| required | `true` |
| meetingAt | `2026-09-30T09:00` |
| attendees | `Project Manager, Municipality Reviewer` |
| purpose | `Discuss setback clarification` |

### 9g. Back on the submission itself: resolve and approve

| Action | Result |
|---|---|
| Click **Request Clarification** | `clarificationRequested = true` |
| Click **Respond to Clarification**, response = `Setback corrected to 3m as required.` | response stored |
| Click **Approve**, permitReference = `PERMIT-2026-014` *(required the first time you approve)* | `UNDER_REVIEW → APPROVED` |

---

## Stage 10 — Supervision workstream

Screen: **Project → Supervision tab**

### 10a. Supervision agreement → New

| Field | Sample value |
|---|---|
| type | `MONTHLY` |
| visitsAllowed | `4` |
| amount | `550.00` |
| startDate | `2026-09-18` |
| notes | `Standard monthly retainer.` |

### 10b. Site visit → New

| Field | Sample value |
|---|---|
| visitDate | `2026-09-20` |
| attendees | `Site Engineer, Contractor Foreman` |
| notes | `First site walk before groundwork.` |

### 10c. On that site visit → Observations tab → New

| Field | Sample value |
|---|---|
| description | `Rebar spacing on ground floor slab wider than drawing spec.` |
| category | `Structural` |

### 10d. On the same site visit → Instructions tab → New

| Field | Sample value |
|---|---|
| directiveText | `Correct rebar spacing to match approved drawing before pouring.` |
| assigneeId | your user id |
| dueDate | `2026-09-23` |

### 10e. Turn the observation into a tracked Issue

Screen: **Project → Issues → New**

| Field | Sample value |
|---|---|
| observationId | the observation from 10c (the form links it for you) |
| title | `Incorrect rebar spacing on ground floor slab` |
| description | `Spacing measured at 250mm against a 200mm spec.` |
| severity | `HIGH` |
| priority | `HIGH` |
| ownerId | your user id |
| dueDate | `2026-09-23` |
| workstreamType | `SUPERVISION` |

**State after save:** `issue.status = OPEN`

### 10f. Drive the issue to closure, one button at a time

| Action | State change |
|---|---|
| Click **Start** | `OPEN → IN_PROGRESS` |
| Click **Resolve** *(optionally add closureNotes via Edit first)* | `IN_PROGRESS → RESOLVED` |
| Click **Close** | `RESOLVED → CLOSED` |
| *(Reopen is also available if a closed issue needs to come back)* | `CLOSED → OPEN` |

---

## Stage 11 — Drawings ⭐ manual file upload

Screen: **Project → Drawings → New**

### 11a. Register the drawing (identity only, no file yet)

| Field | Sample value |
|---|---|
| number | `DRW-001` |
| title | `Ground Floor Plan` |

**State after save:** drawing exists, `currentRevisionId = null`.

### 11b. Upload the first revision

Screen: that drawing → **Revisions → New**

| Field | Sample value |
|---|---|
| revisionCode | `P1` |
| notes | `First issue for authority submission.` |
| file | **attach a PDF here** |

Use this ready-made real PDF (already on disk, nothing to generate):

```
apps/api/tests/fixtures/sample-upload.pdf
```

Or attach any real PDF/DWG/image from your own machine — any file works,
the system just stores the bytes and remembers the mime type.

**State after save:** `drawingRevision.status = DRAFT`,
`uploadStatus = ACTIVE`, and the drawing's `currentRevisionId` now points at
this revision.

### 11c. Move the revision through approval

| Action | State change |
|---|---|
| Click **Submit** | `DRAFT → SUBMITTED` |
| Click **Review** | `SUBMITTED → UNDER_REVIEW` |
| Click **Approve** | `UNDER_REVIEW → APPROVED` |

⚠️ **Once APPROVED:** a database trigger makes this exact revision row
permanently un-editable and un-deletable, forever. To change anything, you
create revision `P2` instead — the old one stays on record.

---

## Stage 12 — Documents ⭐ another manual file upload

Screen: **Project → Documents → New**

Do this once per row of the (admin-configured) Required Documents
catalogue, so the completeness screen has something to show. Example for
one category:

| Field | Sample value |
|---|---|
| category | `Design` *(must match a RequiredDocument category)* |
| title | `Approved architectural, structural and MEP drawings` |
| description | `Concept design set for client sign-off.` |
| linkedType | *(leave blank, or e.g. `SITE_VISIT`)* |
| linkedId | *(only if linkedType is set — must be given together)* |
| file | attach the same `sample-upload.pdf`, or any real PDF |

Repeat for each catalogue category you want covered: Tests, Design,
Authority, Contract, Construction, Completion (check **Admin → Required
Documents** for the exact current list).

**State after save:** `document.uploadStatus = ACTIVE` the instant the file
finishes writing (`PENDING → ACTIVE`, or `FAILED` if the upload never
completed).

Check progress at **Project → Documents → Completeness** — shows which
required categories still have zero documents against them.

---

## Stage 13 — Modifications

Screen: **Project → Modifications → New**

| Field | Sample value |
|---|---|
| requestText | `Client requests moving the kitchen window 500mm to the left.` |
| impactArea | `ARCHITECTURE` *(or STRUCTURAL / MEP)* |
| costImpact | `Negligible` |
| timeImpact | `None` |
| drawingRevisionId | the P1 revision from Stage 11 *(optional)* |
| observationId | the observation from Stage 10c *(optional — both, one, or neither)* |

**State after save:** `modification.status = DRAFT`

| Action | State change |
|---|---|
| Click **Submit** | `DRAFT → SUBMITTED` |
| Click **Review** | `SUBMITTED → UNDER_REVIEW` |
| Click **Approve** | `UNDER_REVIEW → APPROVED` *(same shared approval machine as drawings)* |

---

## Stage 14 — Handover / closure

Screen: **Project → Handover tab**

Tick each box as the real-world milestone actually happens (each is a
boolean toggle in the form; the server stamps the date the moment you check
it):

- ☐ finalInspectionDone
- ☐ authorityDocsReceived
- ☐ testsReceived
- ☐ asBuiltReceived
- ☐ warrantiesReceived
- ☐ finalReportIssued

Once satisfied, go back to the Project screen:

| Action | State change |
|---|---|
| Click **Complete** | `project.status: ACTIVE → COMPLETED` |
| Click **Close** | `project.status: COMPLETED → CLOSED` *(terminal, read-only)* |

---

## The one file you need for every upload step

`apps/api/tests/fixtures/sample-upload.pdf` — a genuine, valid, openable
PDF, reusable for Stage 11b, Stage 12, and any drawing revision P2/P3 you
want to add. Attach it as many times as you like; each upload creates its
own independent copy on disk.

---

## Where the uploaded file actually goes

Storage is env-driven (`DRIVE_BACKEND`, defaults to `local`); the shipped
`.env` doesn't override it, so uploads land on local disk via
`LocalDriveAdapter`.

**Root folder:** `LOCAL_DRIVE_DIR` env var if set — the shipped `.env`
doesn't set it, so it defaults to `./.local-drive` resolved against the API
process's working directory (i.e. wherever you ran `node dist/main.js`
from — normally `apps/api/`, giving `apps/api/.local-drive/`).

Inside that root, the path differs by upload type:

| Upload type | Path pattern | Example |
|---|---|---|
| Document (Stage 12) | `<projectId>/<random-uuid>` | `.local-drive/41e43170-.../9c3e92b0-...` |
| Drawing revision (Stage 11b) | `<projectId>/drawings/<drawingId>/<random-uuid>` | `.local-drive/41e43170.../drawings/0b806596.../3c40c4e9-...` |

The database never stores the absolute path — `document.fileId` /
`drawingRevision.fileId` store only the relative part after the root
(`<projectId>/<uuid>` etc). The `mimeType`, `originalFilename` and
`sizeBytes` columns next to it are what the app uses to serve it back
correctly.

To view a file again, you don't need the disk path at all:

```
GET /projects/:projectId/documents/:id/content
GET /projects/:projectId/drawings/:drawingId/revisions/:id/content
```

These stream the bytes back with the right `Content-Type` — inline in a
browser for PDFs/images, as a download for anything else.

If you ever do need the disk path directly (e.g. to inspect the raw file):

```
<LOCAL_DRIVE_DIR or ./.local-drive> + "/" + the fileId column's value
```

---

## Side branches — rejection, return, hold, cancel

### Drawing revision rejected or sent back

From `SUBMITTED` or `UNDER_REVIEW`:

| Action | State change |
|---|---|
| Click **Reject** | `→ REJECTED` *(terminal for this revision)* |
| Click **Return for Revision** | `→ RETURNED_FOR_REVISION` |

Either way this revision is done — you don't edit it (nothing about a
revision's content may ever change). You create a new one instead: Drawings
→ this drawing → Revisions → New, `revisionCode = "P2"`, attach a corrected
file, and walk P2 through Submit → Review → Approve again.

### Modification rejected or sent back

Same shared machine as drawings, from `SUBMITTED` or `UNDER_REVIEW`:

| Action | State change |
|---|---|
| Click **Reject** | `→ REJECTED` |
| Click **Return for Revision** | `→ RETURNED_FOR_REVISION` |

No "create P2" convention here — you'd normally just create a fresh
Modification record with the corrected `requestText` if the client comes
back.

### Submission: reject / return / withdraw / halt / resume / cancel

From `UNDER_REVIEW`:

| Action | State change |
|---|---|
| Click **Reject** | `→ REJECTED` *(terminal)* |
| Click **Return for Revision** | `→ RETURNED_FOR_REVISION` — edit (PATCH) and click **Submit** again to push back to `SUBMITTED`, then **Review** again |

From (most) active states:

| Action | State change |
|---|---|
| Click **Withdraw** | `→ WITHDRAWN` *(pulled back voluntarily)* |
| Click **Halt** | `→ HALTED` *(paused; `preHaltStatus` quietly remembers what it was, e.g. `UNDER_REVIEW`)* |
| Click **Resume** | `→` back to whatever `preHaltStatus` recorded *(`preHaltStatus` cleared once resumed)* |
| Click **Cancel** | `→ CANCELLED` *(terminal)* |

Clarification round-trip (independent of the status column):

| Action | Result |
|---|---|
| Click **Request Clarification** | `clarificationRequested = true`, `clarificationRequestedAt` stamped |
| Click **Respond to Clarification**, response = `Setback corrected to 3m as required.` | `clarificationResponse` stored, `clarificationRespondedAt` stamped *(`clarificationRequested` stays `true` — it's a log, not a re-usable flag)* |

### Issue reopened

From `CLOSED`:

| Action | State change |
|---|---|
| Click **Reopen** | `→ OPEN` *(goes right back to the start of the same OPEN → IN_PROGRESS → RESOLVED → CLOSED chain from Stage 10f)* |

### Proposal: lost / on hold / resumed

From most active states (`NEW`, `CONCEPT`, `CLIENT_REVISION`, `APPROVED`):

| Action | State change |
|---|---|
| Click **Lose** | `→ LOST` *(terminal — the inquiry didn't convert)* |
| Click **Hold** | `→ ON_HOLD` *(paused, e.g. client went quiet)* |
| Click **Resume** (from `ON_HOLD`) | `→ CONCEPT` — always lands back in `CONCEPT` regardless of what it was paused from; it does not remember the exact prior state the way `Submission.halt` does |

Note: `WON → CONVERTED` is the *one* path that mints a Project; `LOST`/
`ON_HOLD` proposals never do, even if later resumed and re-approved.

---

## User flow — who does what (role-based)

Based on the actual `role_permission` grants in the database. This is
admin-configurable **data**, not hardcoded logic (see `schema.prisma`'s own
comment on `RolePermission`) — it is expected to change as the client's org
chart firms up.

### Roles in this system

| Role | Scope | What it's for |
|---|---|---|
| SYSTEM_ADMINISTRATOR | Global | Everything: users, roles, config, override |
| DIRECTOR | Global | View everything + approve (planning, drawings). Never creates. |
| PROJECT_MANAGER | Mostly project | Sets up and runs the project day to day. Broadest hands-on role. |
| PLANNING | Project | Planning activities/submissions/drawings, scoped to their projects |
| SUPERVISION | Project | Site visits/observations/instructions/issues, scoped to their projects |
| DOCUMENT_CONTROLLER | Project | Owns the document register, scoped to their projects |
| CLIENT_STAKEHOLDER | — | Placeholder, no permissions granted yet ("when enabled" per PRD) |

Everything except a few GLOBAL admin/portfolio permissions is
PROJECT-scoped — a person only acts on projects where a `ProjectMember` row
(Stage 8) puts them.

### Stage-by-stage responsibility and handoffs

| Stage(s) | Who | Notes |
|---|---|---|
| 1–2 Proposal intake → WON | PLANNING or PROJECT_MANAGER | Both hold `proposal:create`/`edit`. DIRECTOR has no `proposal:*` permission at all. |
| 3–5 Client / Contact / Property | PROJECT_MANAGER or SYSTEM_ADMINISTRATOR | `client:create`/`property:create` are GLOBAL-only; PLANNING/SUPERVISION can only view. **Handoff:** Planning hands the won proposal to a PM, who formalizes the client record. |
| 6 Convert proposal → project | PROJECT_MANAGER or SYSTEM_ADMINISTRATOR | `proposal:convert` is a narrower permission than `proposal:edit`, gated separately since it also creates a Project. |
| 7–8 Activate, add members | PROJECT_MANAGER | `project:edit`, `project:manage_members`. **Handoff:** the PM staffs the project — adding the Planning/Supervision people who do Stages 9–13. |
| 9 Planning workstream | Create/edit: PLANNING or PROJECT_MANAGER. Approve: PLANNING itself, DIRECTOR, or ADMIN | `PROJECT_MANAGER` does **not** hold `planning:approve` — a PM can prepare a submission but cannot approve their own work. **Handoff:** Planning submits → a Director (or another Planning-team member, per current config) approves. |
| 10 Supervision workstream | SUPERVISION or PROJECT_MANAGER | Issue **close** is its own gate (`issue:close`) — PLANNING can only view issues. Typically the Supervision engineer logs the visit/issue on site; the PM or same engineer closes it once fixed. |
| 11 Drawings + revisions | Create/upload: PLANNING or PROJECT_MANAGER. **Approve: DIRECTOR or SYSTEM_ADMINISTRATOR only.** | Hard separation of duty — PLANNING and PROJECT_MANAGER do not hold `drawing:approve` at all. Whoever drafts/uploads a revision can never approve it themselves. |
| 12 Documents | DOCUMENT_CONTROLLER (day to day) or PROJECT_MANAGER | PLANNING/SUPERVISION/DIRECTOR can only view. **Handoff:** PM or Supervision hands paperwork to the Document Controller to register/upload/categorize. |
| 13 Modifications | Same as Stage 9 (shares `planning:*` permissions) | PLANNING/PROJECT_MANAGER create; PLANNING/DIRECTOR/ADMIN approve. |
| 14 Handover / closure | PROJECT_MANAGER or SYSTEM_ADMINISTRATOR only | `project:close` is not held by Planning/Supervision/Director. **Handoff:** PM confirms handover checklist items (often chasing Document Controller/Supervision for evidence), then clicks Complete → Close. |

### One line per role

- **PROJECT_MANAGER** — runs the whole project end to end; the only role
  that can create clients/properties, convert proposals, manage members,
  and close projects.
- **PLANNING** — works submissions/drawings/modifications inside their
  projects; can approve their own team's submissions but never a drawing.
- **SUPERVISION** — works site visits and issues inside their projects; the
  only non-PM/admin role that can close an issue.
- **DOCUMENT_CONTROLLER** — the register keeper; everyone else can only
  view documents, this role (plus PM/Admin) can manage them.
- **DIRECTOR** — read-only across the whole portfolio, plus the final
  approval stamp on planning submissions and drawings.
- **SYSTEM_ADMINISTRATOR** — does anything any of the above can, plus
  user/role administration and the required-documents catalogue.
