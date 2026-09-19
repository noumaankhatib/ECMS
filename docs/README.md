# ECMS — Documentation

Engineering Consultancy Management System.

## Documents

| Document                                                   | What it is                                                                                                                                                                                                       | Read it when                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`architecture-discussion.md`](architecture-discussion.md) | The Phase 1 architecture analysis: PRD breakdown, structural lessons taken from the UIFP reference, security gap analysis, target architecture, domain boundaries, concurrency design, and the decision register | You need the reasoning behind a decision, or you are taking the open questions to the client |
| [`PROGRESS.md`](PROGRESS.md)                               | What has been built, what was verified at each step, and the bugs found along the way                                                                                                                            | You want the current state, or a record of why something was decided                         |
| [`phase-1-plan.md`](phase-1-plan.md)                       | What is being built first, in what order, and what "done" means. Includes the decisions already taken                                                                                                            | You are working on the current phase                                                         |

## Where things stand

**Phase 1 — Foundation.** Authentication, users, roles, clients, properties and projects (PRD §20).

| Step                                                       | Status  |
| ---------------------------------------------------------- | ------- |
| 0 — Project skeleton and tooling                           | ✅ Done |
| 1 — Database, migrations, privilege model                  | ✅ Done |
| 2 — Correlation IDs, logging, error handling, audit writer | Next    |
| 3 — Users and login                                        |         |
| 4 — Roles, permissions, the authorization choke point      |         |
| 5 — Clients, contacts, properties                          |         |
| 6 — Projects and membership                                |         |
| 7 — Environment setup script                               |         |
| 8 — Web interface                                          |         |

## Running it locally

```bash
pnpm install
pnpm db:up          # start PostgreSQL
pnpm db:deploy      # apply migrations
pnpm check          # format, lint, types
```

## Proposals — inquiry to project

Replaces the paper/Excel sketch register (`2026 Sketch Register - NOuman.xlsx`) staff ran this workflow
in before the system existed. Full rationale in `phase-5-plan.md`; this is the quick-reference version.

**What it is.** The record of an inquiry from first contact up to either a lost/on-hold outcome, or
conversion into a real, numbered Project. A proposal can be created from nothing but a name and a phone
number — a `Client`/`Property` is never required up front, only attached once/if one exists.

**Fields captured on intake:**

| Field                  | Meaning                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `contactName` / `contactPhone` | Who actually rang or walked in — free text, not tied to any Client record                |
| `clientId` / `propertyId`      | Optional links, attach now if known or later once the records exist                      |
| `sketchTypeId`          | Picked from the admin-managed **Sketch types** list (see below) — not free text                 |
| `projectType`           | The eventual `PLANNING` / `SUPERVISION` / `BOTH`, carried onto the Project on conversion          |
| `approxAreaSqm`         | Approximate plot area                                                                             |
| `source`                | Provenance — "old customer", "referral", "walk-in" — **separate** from `status`, never confused with it |
| `assignedArchitectId`   | Who's working the sketch                                                                          |
| `receivedAt` / `dueAt`  | Date the inquiry came in, and the follow-up deadline it's due by                                   |
| `notes`                 | Free text, e.g. a prior job reference                                                             |
| `sketchNumber`          | Generated automatically on save — `YY-SB-NNN` (e.g. `26-SB-118`), never entered by hand           |

**Sketch types.** A short admin-managed pick list (`/sketch-types`, needs `sketch_type:admin`), seeded
by migration with the values already in real use: Villa - GF Only, Villa - G+1, Villa - G+1+PH, Twin
Villa, Farm Houses, Extensions, Industrial, Res/Comm, Plot Division, Krookie Division. An administrator
can add, rename, or retire (never delete) entries without a code change. If a proposal's "Type of
sketch" dropdown looks empty, the seed migration hasn't been applied to that environment
(`pnpm db:deploy`) — the list is never empty by default.

**`sketchTypeId` lives only on the Proposal — it has no life on the Project it converts into.**
`Project` has no sketch-type column at all, so this field is never carried forward, never re-shown, and
never editable again once its Proposal reaches `CONVERTED`. In practice that means:

- Fill it in any time the proposal is still editable — from intake all the way through `WON`, right up
  until someone clicks **"Convert to project"**.
- The moment conversion happens, the Proposal freezes (see the status table below); a proposal already
  converted with this field left blank cannot be fixed through the UI — the Edit button and every
  status action disappear along with it, by the same rule that locks `LOST`.
- There is no equivalent field to fill in on the Project afterwards. If it matters for reporting, treat
  "set the sketch type before converting" as a checklist item on the conversion step itself, not
  something to circle back to later.

**Status lifecycle.** Every change goes through a named action, never a direct status write; the UI only
ever offers the moves legal from the current status, and the server re-checks regardless.

| Status            | Can move to                                    |
| ------------------ | ------------------------------------------------ |
| `NEW`              | `CONCEPT`, `ON_HOLD`, `LOST`                     |
| `CONCEPT`          | `CLIENT_REVISION`, `ON_HOLD`, `LOST`             |
| `CLIENT_REVISION`  | `CONCEPT` (rework), `APPROVED`, `ON_HOLD`, `LOST` |
| `APPROVED`         | `WON`, `LOST`                                    |
| `WON`              | *(terminal — only "Convert to project" leads out)* |
| `LOST`             | *(terminal)*                                     |
| `ON_HOLD`          | `CONCEPT` (resume), `LOST`                       |
| `CONVERTED`        | *(terminal — reached only via convert, never a status edit)* |

**Convert to project.** `POST /proposals/:id/convert`, allowed only `WON → CONVERTED`, needs
`proposal:convert`. Refuses if `propertyId` is not set — a project always needs a real property, never
one silently invented from the free-text intake fields. When it succeeds, inside one transaction: a
project number is reserved (`SequenceService`), the `Project` row is created carrying `clientId`/
`propertyId` across, its workstreams open per `projectType`, and the proposal is marked `CONVERTED` with
the link recorded both ways.

**Permissions:**

| Role                   | Can do                                                                 |
| ----------------------- | ------------------------------------------------------------------------ |
| `SYSTEM_ADMINISTRATOR` | Everything, plus manage the sketch-type list                             |
| `DIRECTOR`              | View only — oversight, not data entry                                    |
| `PROJECT_MANAGER`       | Everything, including convert and managing the sketch-type list          |
| `PLANNING`              | Create/edit day to day; conversion is a manager decision, not theirs     |

All `GLOBAL` scope — a proposal predates any Project, so there's no membership to scope it by.

## Required documents — the completeness checklist

Two separate things share this name, filled in at two different times. Getting them confused is the
most common source of "why is my document not counting" — see `phase-9-plan.md` for the full rationale.

**1. The catalogue itself — admin setup, done once, not per project.** `/required-documents`
(needs `required_document:admin`) is a small, hand-maintained list of categories every project is
expected to hold evidence for. Seeded by migration with:

| Category      | Label                                                                    | Scope |
| -------------- | -------------------------------------------------------------------------- | ----- |
| `Design`       | Approved architectural, structural and MEP drawings                        | ANY   |
| `Tests`        | Soil, concrete, block, waterproofing and other applicable reports          | ANY   |
| `Authority`    | Municipality approvals, permits and stage approvals                        | ANY   |
| `Contract`     | Client agreement, contractor documents and related approvals               | ANY   |
| `Construction` | Material approvals, inspection records and certificates                    | ANY   |
| `Completion`   | As-built drawings, completion documents, warranties and handover records   | ANY   |

`scope` is `PLANNING`, `SUPERVISION`, or `ANY` — a requirement scoped to one workstream still applies to
a `BOTH`-type project, since a `BOTH` project runs both workstreams at once. An administrator can add,
rename its label, or retire (archive, never delete) an entry; `category` itself is never editable once
created — a proposal or document already matching it would be silently re-pointed if it were, the same
rule `ProposalSketchType.code` follows. If this list is ever genuinely empty in an environment, it's a
missed `pnpm db:deploy`, not the intended starting state.

**2. Actual files, uploaded per project, continuously.** A project's own `/projects/:id/documents` page
is where real files get attached — this is ongoing, spread across the whole project's life, not a
one-time form:

| Field       | Meaning                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------- |
| `category`   | Free text — **type it to match a catalogue category exactly** (e.g. `Design`) to have this upload count toward that checklist item; anything else still uploads fine, it just satisfies nothing |
| `title`      | A human name for the file                                                                 |
| `description`| Optional notes                                                                            |
| `file`       | The upload itself — metadata is stored here; bytes go to Google Shared Drive              |

The web form's Category field is a dropdown built from the project's own applicable catalogue entries
(plus an "Other…" escape hatch for anything not on the checklist), so a typo can no longer silently miss
the match the way free text could.

**Completeness is computed at read time, not stored.** `DocumentService.completeness()` compares what's
been uploaded against what the catalogue requires for this project's type, and returns a ✓/✗ per
category — nothing here is a stored flag that can drift out of sync with reality.

**This is also a hard gate at project closure.** A project cannot move `COMPLETED → CLOSED` while any
applicable required-document category is still unsatisfied (Phase 10) — the same "real gate, not just a
label" treatment open issues get. Practically: don't leave this until the end — file each category's
evidence as the relevant stage of work actually happens (Design early, Authority once submissions clear,
Tests/Construction during build, Completion at handover), so closure isn't blocked on a last-minute
scramble.

## Roles & permissions

Three ideas, and the order they matter in:

1. **A role is a named bundle of permissions.** Seven exist, fixed in code
   (`packages/contracts/src/index.ts`'s `ROLE_DEFINITIONS`) — adding an
   eighth is a migration, not a config change.

   | Role                   | What it's for                                              |
   | ----------------------- | ----------------------------------------------------------- |
   | `SYSTEM_ADMINISTRATOR` | Users, roles, permissions, system configuration              |
   | `DIRECTOR`              | Portfolio-wide visibility, dashboards, approvals            |
   | `PROJECT_MANAGER`       | Project setup, coordination, assignments                    |
   | `PLANNING`              | Planning activities, submissions, drawings, approvals        |
   | `SUPERVISION`           | Site visits, observations, instructions, issue closure       |
   | `DOCUMENT_CONTROLLER`   | Document metadata, revisions, controlled records            |
   | `CLIENT_STAKEHOLDER`    | Restricted, read-only access when explicitly enabled         |

2. **Every permission a role holds is tagged `GLOBAL` or `PROJECT`.** This is
   the distinction the whole authorization model rests on
   (`AuthorizationService`, `apps/api/src/modules/access/authorization.service.ts`).
   `GLOBAL` means "anywhere in the portfolio." `PROJECT` means "only on
   projects this person is a *member* of." A role says what kind of thing
   someone may do; membership says where. Example — what `SUPERVISION`
   actually holds:

   ```
   client:view          GLOBAL   ← sees every client, anywhere
   property:view        GLOBAL   ← sees every property, anywhere
   project:view         PROJECT  ← only projects they're a member of
   supervision:create   PROJECT  ← only on projects they're a member of
   issue:close          PROJECT  ← same
   ```

3. **A user can hold more than one role.** Their real permissions are the
   union of every role they hold.

**Working with this in the app:**

- Grant/revoke a role: `/users/[id]` → "Grant role" form.
- Add someone to a specific project (the "where"): `/projects/[id]` →
  "Add to project" form. A `PROJECT`-scoped role holder sees nothing until
  they're a member of at least one project.
- The role catalogue and its permission grants (`role`/`role_permission`
  tables) are system configuration, not business data — they're seeded once
  and don't get touched by day-to-day use of the app.

## Two rules that are enforced, not just documented

**Module boundaries.** A module is reached only through its `index.ts`. Deep imports and cross-module relative paths fail the build — not code review.

**Audit history is append-only.** The application's database account holds `INSERT` and `SELECT` on `audit_entry` and nothing else. It cannot alter or delete history even if the code tries (PRD §10).
