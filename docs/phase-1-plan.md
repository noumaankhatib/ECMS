# Phase 1 — Foundation

> **Source:** PRD §20, Phase 1 — _"Authentication, users, roles, clients, properties and projects."_
> **Status:** Plan for review. Nothing built yet.
> **Prerequisite:** the architecture discussion document has been reviewed.

---

## 1. What Phase 1 is, in one sentence

Everything that has to exist before the interesting work can start — plus proof that the permission model actually works.

## 2. Why this first

**Everything depends on it.** You cannot record a site visit without a project. You cannot attach a drawing without a project. Clients, properties and projects are the trunk of the tree.

**It is where the riskiest thing gets proven.** Getting _"this person can only see their own projects"_ right is the highest-risk part of the entire system. Phase 1 is small enough to get it right and test it properly, before a dozen modules depend on it.

**It is barely blocked.** Login and client records do not need approval rules or drawing numbering conventions. We can build while those questions are with the client.

---

## 3. Scope

### In scope

| Area                  | What gets built                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Foundations**       | Project skeleton, database, migrations, configuration, error handling, structured logging, audit trail, environment setup script, CI pipeline |
| **Identity & access** | Login/logout, user accounts, the seven roles, the permission catalogue, project membership, the single authorization choke point              |
| **Directory**         | Clients (create, edit, search, archive), contacts, properties linked to clients                                                               |
| **Projects**          | Projects linked to a client and property, workstreams, people assigned to projects, project status                                            |
| **Interface**         | A working web application: login, navigation, and list/detail/edit screens for the above, styled per PRD §18–19                               |

### Explicitly out of scope

No planning workflow. No supervision or site visits. No observations, instructions or issues. No documents. No drawings or revisions. No approvals. No handover. No dashboards or reports. No notifications. **No Google Drive integration whatsoever.**

Those are Phases 2–5.

---

## 4. The data model for Phase 1

Deliberately small. Every table gets a UUID primary key, `created_at`, `updated_at`, and — where PRD §12 requires archival — `deleted_at`.

### Access

- **`users`** — email, display name, password hash, status (active/disabled)
- **`roles`** — the seven roles from PRD §3
- **`permissions`** — the six verbs from PRD §8, paired with a resource (e.g. `project:view`, `client:edit`)
- **`role_permissions`** — which role holds which permission
- **`user_roles`** — a user's _global_ role
- **`project_members`** — a user's role **on a specific project**, plus who granted it and when

> `project_members` is the table that makes "view **authorized** projects" real. It is the piece the PRD implies but never states.

### Directory

- **`clients`** — name, reference, status, archived flag
- **`contacts`** — belongs to a client; name, email, phone, position
- **`properties`** — belongs to a client; name, address, identifiers

### Projects

- **`projects`** — belongs to a client and a property; code, name, type (Planning / Supervision / Both), status, dates, and a `version` column for concurrency
- **`workstreams`** — belongs to a project; type and status

### Audit

- **`audit_entries`** — when, who, what action, which record, which project, and the before/after values. Append-only.

---

## 5. The authorization model — the heart of Phase 1

This is the part worth reading twice.

### The rule

> **What you may do = what your global role allows + what your role on _this specific project_ allows.**
> Anything not explicitly granted is denied.

An Admin or Director has portfolio-wide access. Everyone else earns access to a project by being a member of it.

### Two independent checks, not one

A single forgotten permission check is exactly how systems leak data between clients. So there are two layers, and they do not depend on each other:

1. **The explicit check.** Every action calls one shared `authorize(user, action, resource)` function. One function, one place, easy to review.
2. **The safety net.** The data layer always filters queries to the projects the user may see. If someone forgets check #1, the query returns **nothing** — rather than everything.

Layer 2 is what turns a bug from a data breach into an empty screen.

### Make the permission matrix _data_, not code

Client question **B2** (who can do what, in each module) is still open. So the role-to-permission mapping lives in the **database as rows**, not scattered through the code.

When the client answers B2, it is a data change and a migration — not a rewrite. Same approach for project statuses (question **B1**): defined in one place, cheap to change.

This is how we build now without guessing wrong later.

---

## 6. Build order

Each step ends with something that can actually be run and checked.

| #   | Step                                                                                                                               | Done when                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **Project skeleton and tooling** — repository layout, strict TypeScript, linting, formatting, module-boundary rules enforced by CI | `npm run check` passes on an empty project; a forbidden cross-module import fails the build                                                                                                 |
| 1   | **Database and migrations** — connection, migration tooling, two database roles (one for the app, one for schema changes)          | Migrations run clean from an empty database, and roll back                                                                                                                                  |
| 2   | ✅ **DONE** — **Cross-cutting foundations** — error handling, structured logging with a correlation id, and the audit writer       | Correlation id flows request → log → audit row; audit and the change it describes share one transaction; the app account cannot alter or delete audit rows. Five integration tests prove it |
| 3   | **Users and login** — accounts, password hashing, sign in/out, session handling                                                    | A user can log in and out; bad credentials give no clue whether the account exists                                                                                                          |
| 4   | **Roles, permissions, and `authorize()`** — the catalogue, the mapping, the single choke point                                     | Permission checks pass and fail correctly in tests                                                                                                                                          |
| 5   | **Clients, contacts, properties** — first real CRUD; proves the whole stack end to end                                             | Create, edit, search and archive all work; every change writes an audit row; a client with history cannot be deleted                                                                        |
| 6   | **Projects and membership** — projects, workstreams, assigning people                                                              | **The critical test:** a user who is not a member of a project gets an empty result from the API — not a hidden button                                                                      |
| 7   | **Environment setup script** — one command to take a fresh machine or environment to working                                       | Runs twice safely; refuses to touch production without an explicit flag; has a dry-run mode                                                                                                 |
| 8   | **Web interface** — login, navigation, and screens for clients, properties, projects and users, in the PRD's colour palette        | An admin can complete every Phase 1 task through the browser                                                                                                                                |

Steps 0–2 are plumbing and can move fast. **Steps 4 and 6 are the ones to slow down on and review carefully** — they are the security foundation.

---

## 5a. Validated transitions — applies to every workflow

Confirmed with the client: **no record may change state by having a field written directly.** Every state change goes through a transition that is checked on the server and refused if it is not legal from the current state.

This covers all four state machines, not only projects:

| Workflow                       | Legal transitions                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Project**                    | `Draft → Active`, `Active ⇄ On Hold`, `Active → Completed`, `Completed → Closed`. Nothing leaves `Closed`             |
| **Approval** (Phase 3)         | `Draft → Submitted → Under Review → Approved / Rejected / Returned for Revision`; `Returned for Revision → Submitted` |
| **Issue** (Phase 2)            | `Open → In Progress → Resolved → Closed`. Reopening returns to `Open` and is recorded                                 |
| **Drawing revision** (Phase 3) | Created, may be approved, superseded by a later one. An approved revision is never edited                             |

**Enforced in three layers:**

1. **The transition is the only way in.** There is no generic "update status" operation. There are named actions — _put on hold_, _complete_, _close_ — each knowing which states it may run from.
2. **Applied inside a transaction, conditional on the current state.** The change only lands if the record is still in the state we read. If two people act at once, the second finds nothing to change and is refused. This also solves double-approval without locking anything.
3. **Every attempt is audited, including refusals.** A rejected transition is exactly what an audit trail exists for.

The transition table is data, so adding a state or changing what is legal is not a logic rewrite.

---

## 6a. Correction — migrations are forward-only

My earlier note said every migration should have a matching `down`. Having confirmed Prisma as the tool (decision 4), that is **not achievable and not worth fighting**: Prisma Migrate is deliberately forward-only. It has no `down` migrations.

**What we do instead:**

- **Fix forward.** A mistake is corrected by a new migration, not by reversing one. This is standard practice and, in truth, is what teams do anyway — reverse migrations are rarely exercised and are frequently wrong when finally needed.
- **Recovery comes from backups and point-in-time recovery**, which PRD §13 already requires. That is the real safety net for a bad schema change, not a `down` script.
- **PRD §13 already mandates** a recovery point before any major schema release. That covers the same risk more reliably.

This is a genuine trade-off, accepted knowingly rather than discovered later.

---

## 7. Definition of done

Phase 1 is complete when all of these are demonstrably true:

- An Admin can log in, create a user, and assign them a role.
- An Admin can create a client, add a property, and create a project.
- A Project Manager logs in and sees **only** the projects they are a member of.
- A user who is not a member of a project receives **nothing** from the API for it — verified by an automated test, not by inspecting the UI.
- Every create, edit and archive writes an audit row naming the actor, the record and the change.
- No one, including the application itself, can edit or delete audit history.
- Archiving a client that has projects is refused.
- Migrations run cleanly from an empty database.
- One command sets up a fresh environment.
- Integration tests run in CI and gate merges.

---

## 8. What is still blocked, and how we work around it

| Open question                       | Effect on Phase 1                     | Workaround                                                                                                        |
| ----------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **B1** — project lifecycle states   | Small. We need _some_ statuses        | Start with `Draft → Active → On Hold → Completed → Closed`, defined in one place so changing them is cheap        |
| **B2** — who can do what per module | Moderate. Affects the permission rows | Build the _mechanism_ now with a sensible starting matrix stored as data. The client's answer becomes a migration |
| **B12** — where this will run       | None for Phase 1                      | Keep hosting-specific concerns behind a boundary. Needs answering before Phase 3                                  |

Everything else on the open-questions list (approvals, drawings, issues, documents, Drive) belongs to later phases and does not block this work.

---

## 9. Decisions taken

| #   | Decision                                                              | Status                  | Notes                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Google Drive and documents are out of Phase 1**                     | **Agreed**              | Deferred to Phase 3. Nothing in Phase 1 requires a file. Also unblocks us from guessing at the Drive access model                                                                                                                                                                       |
| 2   | **Project statuses: `Draft → Active → On Hold → Completed → Closed`** | **Confirmed by client** | `Closed` is read-only and archived. Client also confirmed that **every** workflow transition must be validated server-side, not only project status — see §5a                                                                                                                           |
| 3   | **Role-to-permission matrix for Phase 1** (see §5)                    | **Confirmed by client** | Job title = what kind of work you do; project membership = where you may do it. **Membership confirmed:** both a System Administrator and a Project Manager may add members; a PM only on projects they are themselves a member of. Stored as data, so changes are updates not rewrites |
| 4   | **Technology stack confirmed as PRD §11**                             | **Agreed**              | Next.js (web), NestJS (backend), PostgreSQL (database), Prisma (data access + migrations). Reviewed against requirements; appropriate at this scale                                                                                                                                     |

---

## 10. What I need from you before starting

1. **Confirm the scope above** — particularly that Google Drive and documents are genuinely out of Phase 1.
2. **Confirm the project statuses** in §8, or give me the client's list.
3. **A starting answer on B2** — even a rough "Project Managers can do everything on their own projects, Planning can only edit planning items" is enough to seed the matrix.
4. **Confirm the stack** — PRD §11 names Next.js, NestJS, PostgreSQL and Prisma. I have no objection to any of it at this scale. Say the word and it is settled.
