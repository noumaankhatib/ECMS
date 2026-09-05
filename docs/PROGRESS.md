# Progress

Running record of what has been built, what was verified, and what changed along the way.
Updated at the end of every step.

**Phase 1 — Foundation** (PRD §20): authentication, users, roles, clients, properties, projects. Complete.

**Phase 2 — Core Operations** (PRD §20): planning, supervision, site visits, observations, instructions and issues. See `docs/phase-2-plan.md`. Complete.

**Phase 3 — Documents** (PRD §20): document register, drawing revisions, Google Shared Drive and approvals. See `docs/phase-3-plan.md`. Complete.

| Step | Track point                                            | Status  |
| ---- | ------------------------------------------------------ | ------- |
| 0    | Project skeleton and tooling                           | ✅ Done |
| 1    | Database, migrations, privilege model                  | ✅ Done |
| 2    | Correlation IDs, logging, error handling, audit writer | ✅ Done |
| 3    | Users and sign-in                                      | ✅ Done |
| 4    | Roles, permissions, authorization choke point          | ✅ Done |
| 5    | Clients, contacts, properties                          | ✅ Done |
| 6    | Projects and membership                                | ✅ Done |
| 7    | Environment setup script                               | ✅ Done |
| 8    | Web interface                                          | ✅ Done |
| 9    | Planning — activities, milestones, submissions         | ✅ Done |
| 10   | Supervision — site visits, observations, instructions  | ✅ Done |
| 11   | Issues — the fourth state machine                      | ✅ Done |
| 12   | Web interface for Phase 2                              | ✅ Done |
| 13   | Approvals — the shared state machine                   | ✅ Done |
| 14   | Drawings — append-only, immutable-when-approved        | ✅ Done |
| 15   | Documents — register, metadata and the Drive seam      | ✅ Done |
| 16   | Web interface for Phase 3                              | ✅ Done |

---

## Step 0 — Project skeleton and tooling ✅

**Built:** pnpm workspace (`apps/api`, `apps/web`, `packages/contracts`); strict TypeScript; ESLint with module-boundary rules; Prettier; one `pnpm check` command.

**Verified:**

- `pnpm check` passes on a clean tree.
- A deep import into another module's internals **fails the build**.
- A relative import crossing a module boundary **fails the build**.
- An import of another module's `index` is allowed.

**Decisions:** module boundaries enforced by CI rather than review — the reference codebase kept its dependency graph honest by convention and still drifted.

---

## Step 1 — Database, migrations, privilege model ✅

**Built:** PostgreSQL 17 via Docker with a health check; two database accounts (`ecms_owner` owns the schema and runs migrations, `ecms_app` is what the application connects as); Prisma with migrations; the `audit_entry` table.

**Verified:**

- `ecms_app` can connect but **cannot create tables**.
- The application account can `INSERT` and `SELECT` audit rows, and is refused `UPDATE`, `DELETE` and `TRUNCATE`.
- The whole database was destroyed and rebuilt from migrations — **the lock came back by itself**.

**Decisions:**

- Audit immutability is a database privilege, not application logic. PRD §10 becomes a guarantee rather than a promise.
- `audit_entry` has **no foreign key to users** — archiving a person must never damage the record of what they did.

**Corrections made:**

- _Migrations are forward-only._ An earlier note said every migration should have an undo script. Prisma deliberately has none. Fixing forward plus backup/point-in-time recovery (PRD §13) is the real safety net. Accepted knowingly, recorded in `phase-1-plan.md` §6a.
- _`db:reset` used a cached image._ Without `--build`, Docker reused a stale image holding an old init script, so a "clean" rebuild silently differed from the repository. Both `db:up` and `db:reset` now always rebuild.

---

## Step 2 — Correlation IDs, logging, error handling, audit writer ✅

**Built:** request context via `AsyncLocalStorage`; structured logging; one error catalogue with real HTTP status codes; a global exception filter; the audit writer; health endpoints; security headers and a CORS allow-list.

**Verified:**

- A correlation id flows request → log line → audit row, and is echoed to the caller as `x-request-id`.
- An inbound `x-request-id` is honoured **only** if it is a UUID; anything else is replaced, so a caller cannot inject text into the logs.
- **A failed change removes its audit row too** — proving both share one transaction.
- Refusals are recorded, not only successes.
- Security headers present: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`.

**Decisions — three deliberate departures from the reference codebase:**

|                  | Reference codebase                | Here                                 | Why                                                                                                             |
| ---------------- | --------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Log field safety | Deny-list of 5 exact-case names   | **Allow-list**                       | A deny-list only hides what someone remembered to name. Client contacts and commercial terms would sail through |
| Headers          | All headers logged on one channel | Four harmless ones                   | Otherwise cookies and tokens reach disk precisely when logs are being read                                      |
| HTTP status      | Only 200/400/500                  | Real codes (401/403/404/409/422/429) | Browsers, retry logic and monitoring all read them                                                              |

**Bugs found and fixed:**

- A 404 was returning the code `VALIDATION_FAILED`. The filter lumped every framework error into one bucket; each status now maps to its proper code.
- The module boundary rule was blocking legitimate `shared/` imports. The glob matcher treats `*` as able to match `..`. Rewritten as a regex and tested against all three cases.

---

## Step 3 — Users and sign-in ✅

**Built:** `user` and `session` tables; Argon2id password hashing; server-side sessions in an httpOnly cookie; sign in / sign out / current user; a global auth guard; Zod request validation shared with the web app; a break-glass `user:create` command.

**Verified end to end:**

| Behaviour                                                        | Result                |
| ---------------------------------------------------------------- | --------------------- |
| Protected route without signing in                               | `401 UNAUTHENTICATED` |
| Wrong password                                                   | `INVALID_CREDENTIALS` |
| **Unknown email — byte-identical response**                      | `INVALID_CREDENTIALS` |
| Disabled account — same again, no hint why                       | `INVALID_CREDENTIALS` |
| Messy email casing and whitespace accepted                       | ✅                    |
| Session cookie is HttpOnly                                       | ✅                    |
| Sign out genuinely kills the session                             | `401` afterwards      |
| Password stored as `$argon2id$...`                               | ✅                    |
| Audit captured `LOGGED_IN`, `LOGGED_OUT`, and both failure kinds | ✅                    |

14 integration tests, all against the real database.

**Decisions:**

- **Server-side sessions, not self-contained tokens.** Signing out actually revokes access, an administrator can end someone's sessions immediately, and a leaked backup holds only SHA-256 hashes — not usable cookies.
- **Argon2id over bcrypt.** Current OWASP guidance; far better resistance to GPU attack, and no silent 72-byte truncation.
- **Constant-time refusal.** An unknown address is verified against a decoy hash, so a missing account does not answer faster than a wrong password. Without it the sign-in form becomes a way to discover who works here.
- **Deny by default.** The guard is global; a route is public only if it explicitly says so. A new endpoint is protected by having been written, not by someone remembering a decorator.
- **`sameSite=lax` is the CSRF control.** Browsers will not attach the cookie to a cross-site POST. With the CORS allow-list this covers it; a token scheme would be machinery without a matching risk.
- **`entityId` on audit became optional** — a sign-in attempt against an unknown address has no user to point at, and that attempt is exactly what is worth spotting later.

**Bug found and fixed:** ESLint's `--fix` rewrote a constructor-injected import to `import type`, which **silently breaks NestJS dependency injection** — the class is erased at runtime, so the injection metadata becomes undefined and the app fails to start with an opaque message. The rule is now off for the API, with the reason recorded in the config.

---

## Step 4 — Roles, permissions, authorization choke point ✅

The highest-risk part of the system. Everything else is downstream of getting this right.

**Built:** `role`, `role_permission` and `user_role` tables; the permission catalogue in shared contracts; the seven roles and the starting matrix seeded **by migration**; `AuthorizationService` as the single decision point; `@RequirePermission` plus a global guard; rate limiting on sign-in.

**The rule, in one line:**

> what you may do = your role's **global** grants ∪ your role's **project** grants, within projects you belong to

**Verified — 11 tests, mostly about refusals:**

| Case                                                                       | Result             |
| -------------------------------------------------------------------------- | ------------------ |
| Administrator holds every permission                                       | ✅                 |
| **A user with no role holds nothing at all**                               | ✅ deny by default |
| Director sees the portfolio, cannot edit it                                | ✅                 |
| Project Manager refused on a project they are not a member of              | ✅                 |
| **Project-scoped permission with no project named → refused**              | ✅                 |
| Project Manager keeps their global grants (create a project, view clients) | ✅                 |
| Planning gets read-only reference data, nothing more                       | ✅                 |
| `require()` throws FORBIDDEN **without naming the missing permission**     | ✅                 |
| List scoping returns `[]`, never "everything"                              | ✅                 |
| Every seeded permission exists in the shared catalogue                     | ✅                 |
| Sign-in rate limited: 10 attempts then `429`, per address and per source   | ✅                 |

**Decisions:**

- **The matrix is data, seeded by migration.** The client has confirmed the shape but not the fine detail (open question B2). When they answer, it is rows changed by a migration — no application logic touched. That was the promise made when the decision was recorded, and this is it kept.
- **Two independent layers.** `require()` is the explicit check. `visibleProjectIds()` scopes list queries so that an endpoint which _forgets_ the explicit check returns **nothing** rather than everything. One missed check should be an empty screen, not a breach.
- **A project-scoped permission with no project is refused**, not quietly treated as global. That fallback would silently widen access — precisely the failure this design exists to prevent.
- **FORBIDDEN never names the missing permission.** Telling a caller which grant would have worked maps the system out for them. It goes to the log instead.
- **Membership currently returns false for everyone**, because projects arrive in step 6. Every project-scoped permission therefore resolves to denied. Failing closed while incomplete is the right way round.
- **Director holds no edit rights at all.** Oversight, not data entry. Easily loosened if the client disagrees; the reverse is an argument.
- **Rate limiting is per-address _and_ per-source**, so one account cannot be ground down from many machines, nor one machine work through many accounts. Cleared on success, so a mistyped password does not linger.

**Known limit, recorded rather than discovered later:** the rate limiter holds state in memory, so it protects a _single_ instance. Correct at this scale (one process, under 50 users). If the system is ever run as more than one instance this must move to a shared store, or the effective limit multiplies by the instance count. Noted in the code at the point it matters.

**Issue caught during the work:** the permission guard defined its own copy of the metadata key rather than importing it — the same hand-copied-literal pattern flagged in the architecture analysis, where two files must agree and nothing enforces it. Replaced with an import before it could drift.

---

## Step 5 — Clients, contacts, properties ✅

The first real business data, and the first end-to-end exercise of the whole stack.

**Built:** `client`, `contact` and `property` tables; validation schemas shared with the web app; list/search/paginate, create, edit and archive for each; partial unique indexes; permission checks on every route.

**Endpoints:** `/clients`, `/clients/:id/contacts`, `/contacts/:id`, `/properties`.

**Verified — 12 tests plus an end-to-end run:**

| Behaviour                                                        | Result                 |
| ---------------------------------------------------------------- | ---------------------- |
| Admin creates a client; the change is audited                    | ✅                     |
| Planner can **view** clients (holds `client:view`)               | ✅ 200                 |
| Planner **cannot create** one (no `client:create`)               | ✅ 403                 |
| Planner **cannot archive** one                                   | ✅ 403                 |
| **Two people editing from the same version — second is refused** | ✅ `STALE_RECORD`      |
| Archiving a client with a live property is **refused**           | ✅ `DEPENDENCY_EXISTS` |
| The refusal itself is recorded in the audit trail                | ✅                     |
| A refused archive changes nothing                                | ✅                     |
| Archiving works once the property is archived                    | ✅                     |
| Archived clients hidden from lists but not lost                  | ✅                     |
| An archived reference can be reused by a new client              | ✅                     |
| A duplicate reference among live clients is refused              | ✅                     |
| At most one primary contact, previous one demoted automatically  | ✅                     |

**Decisions:**

- **Optimistic locking is the default for edits.** The caller sends the version it read, and that version is part of the `WHERE` clause — so a stale write matches zero rows and is refused. Checking first and then writing would leave a gap for another request to land in.
- **Archive, never delete** (PRD §6, §12). `DELETE` is the verb because that is what the user means; the record survives.
- **Uniqueness ignores archived rows.** A plain unique index would mean archiving a client permanently reserves its name and reference. Partial indexes fix that — the counterpart to soft delete that is easy to forget.
- **At most one primary contact is a database constraint**, not application logic. Two simultaneous requests would both pass an application check and both write.
- **Naming a new primary contact demotes the old one** rather than erroring. It is a normal thing to do; the user should not have to unset the previous one first.
- **A property cannot be attached to an archived client** — it would be reachable from nothing.

**Design tension found and resolved:** a test caught that the _refusal_ to archive was never recorded. The audit row was being written inside the transaction that then threw — so the rollback erased it. The two cases are genuinely different, and the code now says so:

|                      | Where the audit row goes                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| A change happened    | **Same transaction**, so neither can exist without the other                                                  |
| A change was refused | **Its own transaction** — nothing changed, so there is nothing to be atomic with, and the record must survive |

This is the kind of thing that would have looked correct forever without a test asking for it.

---

---

## Step 6 — Projects and membership ✅

The step the plan says to slow down on. Everything the authorization model
promised in step 4 either becomes true here or does not.

**Built:** `project`, `project_member` and `workstream` tables; project
create/edit/list/read; the lifecycle as named transitions; membership add and
remove; workstreams opened from the project's type; real membership lookups
behind `AuthorizationService`; project dependency checks on archiving a client
or a property.

**Endpoints:** `/projects`, `/projects/:id/{activate,hold,complete,close}`,
`/projects/:id/members`, `/projects/:id/workstreams`.

**The critical test, verified over real HTTP and not only in unit tests:**

| Who                                    | `GET /projects` | `GET /projects/:id` |
| -------------------------------------- | --------------- | ------------------- |
| Project Manager **who created it**     | 1 row           | `200`               |
| Project Manager **not on the project** | **0 rows**      | `403`               |
| Planner, a member of nothing           | **0 rows**      | `403`               |
| Administrator (portfolio-wide)         | every row       | `200`               |

The non-member does not receive a filtered screen. The query never selected the
row. They were also refused an edit (`403`) and refused when adding _themselves_
as a member (`403`).

**Verified — 24 tests, plus the end-to-end run above:**

| Behaviour                                                        | Result                  |
| ---------------------------------------------------------------- | ----------------------- |
| Non-member gets nothing from list, read, and edit                | ✅                      |
| Director sees the whole portfolio while a member of nothing      | ✅                      |
| Director still cannot edit any of it                             | ✅                      |
| Adding a planner opens **that** project to them and no other     | ✅                      |
| …and does **not** give them edit rights on it                    | ✅                      |
| The creator becomes a member, so can edit what they just created | ✅                      |
| `BOTH` opens two workstreams; `SUPERVISION` opens one            | ✅                      |
| `DRAFT → COMPLETED` skipping the work                            | ✅ `ILLEGAL_TRANSITION` |
| The refused transition is **recorded**                           | ✅                      |
| Nothing leaves `CLOSED` — no transition, no edit, no new member  | ✅                      |
| Two transitions from the same version — second refused           | ✅ `STALE_RECORD`       |
| Duplicate project code, differing only in case                   | ✅ `CONFLICT`           |
| A property belonging to a different client than the one named    | ✅ `CONFLICT`           |
| Removing the last member of a project                            | ✅ `DEPENDENCY_EXISTS`  |
| Adding a disabled account to a project                           | ✅ `CONFLICT`           |
| A workstream reached through the **wrong** project in the URL    | ✅ `NOT_FOUND`          |
| Archiving a property a project sits on, and the refusal recorded | ✅ `DEPENDENCY_EXISTS`  |
| Archiving a client that has projects                             | ✅ `DEPENDENCY_EXISTS`  |
| Membership add/remove both audited                               | ✅                      |

Also re-verified after destroying and rebuilding the database from migrations:
all 60 tests pass, and `ecms_app` still holds only `INSERT, SELECT` on
`audit_entry` while holding full rights on the three new tables.

**Decisions:**

- **The creator is made a member, in the same transaction as the project.**
  Otherwise a Project Manager could create a project and immediately be refused
  permission to edit it — `project:edit` is PROJECT-scoped and they would belong
  to nothing. The tempting fix later would be to widen the permission, which
  would undo the whole model. Better to make the row now.

- **Membership is a boolean gate, not a second permission system.** A person's
  permissions come from their global role; membership decides only _where_ those
  permissions apply. That is decision 3 read literally — job title says what kind
  of work you do, membership says where you may do it. `project_member.role_code`
  records what someone does on that project and is deliberately not consulted by
  `AuthorizationService`. Worth putting to the client: it means a Project Manager
  added to a project as an observer still gets full rights there.

- **Status is never a field a caller can write.** There are four named actions —
  activate, hold, complete, close — each knowing only its target. The transition
  table (data, in shared contracts) decides whether the move is legal from where
  the project is now. `activate` covers both starting a draft and resuming from
  hold, because the target state is identical and the table already says which
  starting states are legal.

- **The status write is conditional on the current status, not just the version.**
  `WHERE id = ? AND status = ? AND version = ?`. Two people closing the same
  project at the same moment: the second matches zero rows and is refused. This
  is the same mechanism that will stop double approval in Phase 3, without a lock.

- **`project:close` is its own permission.** It is the one move nothing comes
  back from, so it is not folded into `project:edit`.

- **No `archived_at` on `project`.** `CLOSED` is terminal and read-only, and is
  itself the historical record. A second independent flag would be two ways to
  say one thing and two places to get the filtering wrong.

- **Status, type and member role are database CHECK constraints**, not only Zod
  schemas. Validation is per-request; a constraint is per-row. A bad migration or
  a hand-run `UPDATE` cannot put a value in the table that the state machine has
  no rule for. The price is that adding a state means editing two places, which
  is the right price.

- **Project codes are unique case-insensitively**, and _not_ as a partial index —
  unlike clients and properties, projects are never archived, so there is no
  archived row for the index to ignore.

- **A list route needed a weaker check than the others.** A collection endpoint
  names no project, and the step-4 rule refuses a PROJECT-scoped permission with
  no project — which would have shut every Project Manager out of the project
  list. `@RequirePermissionAnywhere` says only "the caller holds this somewhere";
  the query then scopes the rows with `visibleProjectIds`. Someone holding it
  only through membership, but a member of nothing, passes the guard and receives
  an empty page. That is the designed outcome: an empty screen, not a breach.

**Bugs found and fixed during the work:**

- **A nested route could reach into the wrong project.** `PermissionGuard` reads
  the project from the URL, so `POST /projects/<mine>/workstreams/<theirs>/status`
  would have been authorised against _my_ project while acting on _someone
  else's_ workstream. The services now check that the record actually belongs to
  the project in the path. This is the classic shape of the bug the two-layer
  design exists to catch, and it appeared the moment nested routes did. There is
  a test for it.

- **Archiving a property no longer needed a `TODO`.** Step 5 left a comment
  saying a live project should block it once projects existed. It now does, in
  both directions — client and property.

**Known limit, recorded rather than discovered later:** a client that has _ever_
had a project cannot be archived, closed projects included. That is the letter of
the plan's definition of done and it is the safe direction to be wrong in, but
tidying away a customer from ten years ago is a reasonable thing to want. Added
to the open questions below.

---

## Step 7 — Environment setup script ✅

**Built:** `scripts/setup.mjs` — one command that takes an empty machine to a
working one. `pnpm run bootstrap`, or `node scripts/setup.mjs` on a machine that
does not have pnpm yet.

Nine steps, each of which checks the world before it changes it: preflight,
environment file, dependencies, Prisma client, database container, migrations,
build, first administrator, verify.

**Verified — every claim run for real, not reasoned about:**

| Case                                                                      | Result                        |
| ------------------------------------------------------------------------- | ----------------------------- |
| **Empty machine** — no `.env`, no `node_modules`, no container, no volume | ✅ working in 28 seconds      |
| The administrator it created can actually **sign in**                     | ✅ `200` on `/auth/login`     |
| **Run a second time**, unchanged machine                                  | ✅ nothing touched, exit `0`  |
| `--dry-run`                                                               | ✅ full plan, no changes      |
| `--env=production` **without** `--production`                             | ✅ refused, exit `2`          |
| `NODE_ENV=production` alone                                               | ✅ refused, exit `2`          |
| `--production` given but the target is local                              | ✅ refused, exit `2`          |
| Production with required variables absent from the environment            | ✅ refused, names them        |
| **`.env` pointing at a remote host while the target is local**            | ✅ refused before any change  |
| Production dry run                                                        | ✅ no Docker, frozen lockfile |

**Decisions:**

- **Plain JavaScript, zero dependencies.** It has to run before `pnpm install`
  has ever run, on a machine where `node_modules` does not exist. That single
  constraint is why this one file is not TypeScript like everything else — a
  setup script that needs installing first is not a setup script.

- **Every change goes through one function.** `change()` is the only thing that
  alters the machine, which is what makes `--dry-run` worth trusting: there is no
  second path that could slip past it.

- **`migrate deploy`, never `migrate dev`.** `dev` offers to reset the database
  when it thinks history has diverged. That is a data-loss prompt, and prompts
  get answered "yes" by people in a hurry. No path through this script can reach
  it.

- **It never edits an existing `.env`.** It creates one from `.env.example` when
  there is none, and otherwise reports what is missing. A script that rewrites
  the file holding your local credentials is one people stop running.

- **Two independent locks on production**, because they fail differently.
  Naming the target is not enough — `--production` must be passed too, and
  `NODE_ENV` can be set by a shell profile or a CI runner without anyone
  meaning it.

- **The guard that matters most is the other one.** The realistic accident is
  not a mistyped flag; it is a _local_ setup run against a live database because
  `.env` was still pointed at one. So a local run refuses outright if
  `DATABASE_URL` names a host that is not this machine — and it refuses in the
  second step, before installing, before Docker, before migrations.

- **It verifies rather than assumes.** The last step re-proves the guarantee
  from steps 1–2: the application's database account is refused an `UPDATE` on
  `audit_entry`. A privilege that has quietly gone missing looks exactly like
  one that is working, right up until it matters. The `UPDATE` it attempts
  carries `WHERE false`, so it cannot alter a row even if the lock were gone.

- **A first administrator, on local machines only.** Otherwise the setup
  finishes with a system nobody can log into. Elsewhere it only reports —
  generating a credential for a real environment and printing it into somebody's
  scrollback, or a CI log, is not a thing it should do on your behalf.

- **Named `bootstrap`, not `setup`.** `pnpm setup` is pnpm's own command for
  installing pnpm; a script by that name would be shadowed and a new developer
  would silently run the wrong thing.

**Bugs found by running it, which reading it would not have caught:**

- **The wrong success string.** The script looked for `No pending migrations`;
  Prisma actually says `Database schema is up to date!`. Harmless in the migrate
  step — deploy is idempotent — but the _verification_ step would have failed a
  perfectly good environment. Both callers now ask one shared function.

- **`@prisma/client` would not resolve.** It is a dependency of `apps/api`, not
  of the workspace root, and pnpm does not flatten packages into a shared
  `node_modules`. The verification failed on a genuinely fresh machine and the
  user count failed silently for the same reason — one bug wearing two faces.
  Both checks now run from the API's own directory, and the count reports why it
  failed instead of shrugging.

Both of these only appeared because the script was run against a machine
actually torn down to nothing. Neither was visible in review.

**Also:** `.env.example` now lists `PORT`, `CORS_ORIGINS` and `LOG_LEVEL` with
their defaults. Setup validates against that file, so anything undocumented
there is invisible to it.

---

## Step 8 — Web interface ✅

The last step of Phase 1, and the one that makes everything before it usable by
somebody who is not holding a terminal.

**Built:** a Next.js 16 application — sign in and out, a navigation shell, and
list/detail/create/edit screens for clients (with contacts), properties,
projects (with workstreams and membership) and users. Eighteen routes.

**Also built, because the definition of done needs it:** user administration in
the API. Until now the only way to create an account was the break-glass CLI.
`/users` and `/roles`, with create, edit, enable/disable, set password, and
grant/revoke role. `/auth/me` now also returns what the caller may do, so the
interface can hide what they cannot.

**Verified — 12 tests in a real browser, plus 71 API tests:**

| Behaviour                                                              | Result        |
| ---------------------------------------------------------------------- | ------------- |
| A wrong password and an unknown address give the **identical** message | ✅            |
| A signed-out visitor is sent to sign in                                | ✅            |
| An admin creates a client, a property and a project                    | ✅            |
| The project opens with the workstreams its type calls for              | ✅            |
| An admin creates a user and grants them a second role                  | ✅            |
| **A non-member sees no row for a project**                             | ✅            |
| **…and typing its address gets them nowhere**                          | ✅ HTTP ≥ 400 |
| A planner, a member of nothing, gets an empty list                     | ✅            |
| …and is offered no New project button, and no Users link               | ✅            |
| Adding them to a project opens **that one** and no other               | ✅            |
| …and still does **not** let them edit it                               | ✅            |
| Only the legal transitions are offered, and they work                  | ✅            |
| A workstream moves only through its own legal transitions              | ✅            |
| Archiving is refused while a project depends on it, and says why       | ✅            |
| Signing out genuinely ends the session                                 | ✅            |

`pnpm e2e` builds both applications, starts them, runs the browser suite and
shuts them down. It was run twice in a row against the same database to prove it
does not depend on a fresh one.

**Decisions:**

- **Every API call is made from the server, never the browser.** The session
  cookie is httpOnly, so browser JavaScript cannot read it and a scripting flaw
  cannot carry it away. Fetching server-side and forwarding the cookie keeps that
  property rather than trading it for convenience. It also means the API's
  address is never published, so a deployment where the API is not publicly
  routable works unchanged.

- **The interface hides; the API refuses.** Grants are sent to the browser so
  buttons and navigation can be hidden, and that is _all_ they do. Every one is
  enforced again on the way in. A hidden button prevents confusion; the server
  check is what prevents access.

- **Forms work without JavaScript.** Every one is a real `<form>` posting to a
  server action. The client-side part adds the pending state and the error
  banner on top of something already functional.

- **A refusal is a value, not an exception.** Server actions return the error
  rather than throwing, so a rejected save shows the reason above the form the
  person is still looking at, instead of replacing the page and losing what they
  typed. One helper turns API codes into sentences that say what to do next —
  `STALE_RECORD` becomes "Somebody else changed this while you were editing",
  not "That change conflicts with the current state".

- **Which transition buttons appear comes from `PROJECT_TRANSITIONS`** in shared
  contracts — the same table the API checks. The interface cannot drift into
  offering a move the server would refuse, because both read one definition.

- **Colour is declared once.** PRD §18 defines the consultancy's palette and we
  have not been given it; `globals.css` holds a restrained placeholder and no
  component contains a hex value. When the real palette arrives it is twelve
  declarations and nothing else. Status is always shown as a word as well as a
  colour — roughly one man in twelve cannot reliably separate the green from the
  amber, and status is the most important thing on a project row.

- **Playwright, not request-level tests, for this step.** Forms, redirects,
  sessions and the interface's own permission decisions only meet each other in
  a browser. The claim being made is that an administrator can complete every
  Phase 1 task through one, and nothing short of a browser demonstrates it.

**Bugs found, both by running it:**

- **`/properties?clientId=…` had never worked.** The controller read `clientId`
  as a separate parameter while validating the whole query string against a
  **strict** schema that did not include it — so every such request was refused
  before the handler saw it. Step 5's tests called the service directly and
  never went through HTTP, so nothing caught it. There is now one schema that
  knows about the parameter.

- **A rejected query string reported itself as `(body)`.** That sent the
  diagnosis above off in entirely the wrong direction for several minutes. The
  validation pipe now names where the value actually came from.

**And one in the tests themselves:** the browser suite passed the first time and
failed the second. It used fixed accounts, and the first run had added those
people to a project — so "they are a member of nothing" was no longer true. It
now creates its own users per run. A test that only passes on a fresh database
is a test that quietly stops being run.

**Known limits, recorded rather than discovered later:**

- **Lists fetch up to 100 rows and do not page.** Correct at this scale (under
  50 users, and a portfolio in the hundreds), and the API paginates properly
  already — this is a screen to add, not a design to revisit. It should be added
  before the portfolio passes a few hundred projects.
- **No search-as-you-type.** Search is a form submission. Fewer moving parts,
  and it works without JavaScript.
- **A person cannot change their own password.** Only an administrator can set
  one. Worth adding early in Phase 2.

## Open — with the client

| #   | Question                                                              | Blocks                                                                                 |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | ~~Confirm project stage names~~                                       | **Answered: `Draft → Active → On Hold → Completed → Closed`, built**                   |
| 2   | ~~May a Project Manager add members?~~                                | **Answered: yes — Admin and PM both, PM only on their own projects**                   |
| 3   | Is anyone placing files into the shared drive by hand?                | Phase 3. Ask early — a "yes" changes the design materially                             |
| 4   | Should a closed project still block archiving its client?             | Nothing. Currently it does. Easy to loosen to "only live projects block"               |
| 5   | May someone be on a project _without_ their full role's rights there? | Nothing yet. Today membership grants their whole role on that project                  |
| 6   | ~~The PRD §18 palette and §19 UI direction — we do not have them~~    | **Answered: the PRD document was located on disk; the real eight colours are applied** |

## Not yet done

**Phase 1 is complete.** Every line of §7's definition of done is demonstrated by
an automated test, not by inspection. The repository now has a remote
(`github.com/noumaankhatib/ECMS`) and a CI workflow (`.github/workflows/ci.yml`)
that runs `pnpm verify` and `pnpm e2e` on every push — it still needs a branch
protection rule turned on to actually gate merges, which is a repository
setting rather than something committed to the tree.

Carried into Phase 2:

- **CI runs but does not yet gate.** The branch protection rule that makes it
  required needs the workflow to have run at least once on the remote first.
- **Lists do not page in the interface**, and nobody can change their own password. Both noted under step 8.

## Mid-session correction

The real PRD document (`Final_PRD_Engineering_Consultancy_Management_System.docx`)
was on disk in `~/Downloads` the entire time — not in the repository, and not
noticed before now. Everything written about the PRD's palette, UI direction and
phase breakdown up to this point was reasoning from
`docs/architecture-discussion.md`'s **commentary about** the PRD, not the PRD
itself. That document turns out to be accurate everywhere it was checked, so
nothing built so far needed correcting — except the palette, which was a stated
placeholder precisely because the real one was believed unavailable. It is
believed unavailable no longer; see step 8's revision below and
`docs/phase-2-plan.md`.

### Step 8, revised — the real PRD §18 palette

`apps/web/src/app/globals.css` now carries the client's actual eight colours
(Deep Ink Blue `#17324D`, Professional Blue `#2F6FAE`, Soft Blue `#EAF2F8`, and
the five neutrals) instead of the placeholder blue-and-slate ramp. The swap
was exactly the twelve declarations promised at the time — plus two new
tokens, `--nav-bg` and `--nav-text`, because a flat eight-swatch brand palette
has no entry for "light text on a dark sidebar" and the placeholder ramp had
been quietly reusing one token (`--slate-900`) for both body text and the
sidebar background, which the real palette gives two different colours.

Every foreground/background pairing was checked against WCAG AA (4.5:1) before
being written, not after:

| Pairing                                   | Ratio     |
| ----------------------------------------- | --------- |
| Charcoal text on white                    | 7.56 : 1  |
| Secondary-grey text on white              | 4.83 : 1  |
| Action-blue link/button text on white     | 5.24 : 1  |
| White sidebar brand text on Deep Ink Blue | 13.13 : 1 |
| Border-grey nav text on Deep Ink Blue     | 9.67 : 1  |

The one pairing that failed — the PRD's own Secondary Text grey directly on
Deep Ink Blue, at 2.72 : 1 — is why `--nav-text` exists rather than reusing
`--text-muted` for the sidebar's on-dark captions. Verified against the built
application, not only the stylesheet: screenshotted signed in as an
administrator and confirmed the sidebar, buttons and status badges render as
intended.

---

## Step 9 — Planning: activities, milestones, submissions ✅

The first of Phase 2's three modules (`docs/phase-2-plan.md`), and the only
one of the three with no open business-rule question attached, which is why
it went first.

**Built:** `planning_activity`, `milestone` and `submission` tables, each
belonging to a project; list/create/edit/archive for activities and
milestones; create/edit/transition for submissions; the full Phase 2
permission catalogue (`planning:*`, `supervision:*`, `issue:*`) seeded in the
same migration, ahead of the two modules that will consume it — the same
approach step 4 used for the whole Phase 1 matrix.

**Endpoints:** `/projects/:projectId/planning/activities`,
`/projects/:projectId/planning/milestones`,
`/projects/:projectId/planning/submissions`,
`.../submissions/:id/status`.

**Verified — 12 tests, all against the real database:**

| Behaviour                                                             | Result                  |
| --------------------------------------------------------------------- | ----------------------- |
| A non-member holds neither `planning:view` nor `planning:create`      | ✅                      |
| The project member holds both                                         | ✅                      |
| Create, list and archive an activity                                  | ✅                      |
| A stale edit to an activity is refused                                | ✅ `STALE_RECORD`       |
| An activity reached through the **wrong project** in the URL          | ✅ `NOT_FOUND`          |
| A milestone is marked reached by setting `achievedDate`, not a status | ✅                      |
| A submission is created at `DRAFT` and audited                        | ✅                      |
| `DRAFT → SUBMITTED` succeeds; `SUBMITTED → DRAFT` is refused          | ✅ `ILLEGAL_TRANSITION` |
| The refused transition is recorded, not only the ones that happened   | ✅                      |
| A stale submission transition is refused                              | ✅ `STALE_RECORD`       |
| **No planning record can be created on a closed project** — all three | ✅ `ILLEGAL_TRANSITION` |
| Every seeded Phase 2 permission exists in the shared catalogue        | ✅                      |

**Decisions:**

- **A submission stops at `SUBMITTED` in this phase, on purpose.** PRD §6 asks
  planning submissions to "record approval decisions, comments and dates," but
  the PRD itself defines exactly one approval state machine shared across
  submissions, drawings and documents (§6), and puts the whole `approvals`
  module in Phase 3. Building a one-off approval flag here would be the first
  of three divergent copies of a rule that should only ever be enforced in one
  place — the same reasoning `architecture-discussion.md` used to reject
  per-workflow approval logic in the first place. `DRAFT → SUBMITTED →
WITHDRAWN` is a small, real transition table — enforced the same way
  `Workstream`'s was in Phase 1 — but it is not one of the four full state
  machines named in `phase-1-plan.md` §5a.
- **The full Phase 2 permission catalogue was seeded now**, not staged one
  module at a time, matching how Phase 1 step 4 seeded `user:*` and `role:*`
  permissions three steps before user administration was built. The modules
  catch up to the data.
- **Every mutation is refused on a closed project** — creating an activity, a
  milestone or a submission, not only editing an existing one. A closed
  project is the historical record of an engagement; that has to be absolute,
  not "closed to new members and workstreams but open to new planning work."
- **`createdBy` on all three tables**, matching Client/Property/Project. Found
  by TypeScript, not by review: the first draft of `activity.service.ts`
  accepted an `actorId` parameter and never used it, because the column did
  not exist yet.

**A schema mistake caught before anything was committed:** the first version
of the migration's Prisma-model edit silently failed to apply — a
find-and-replace matched no text (whitespace differed from what was assumed),
and the script had no assertion on that particular replacement, so it
succeeded quietly and left the three new models undefined while a second,
unrelated edit went through. `prisma validate` caught it immediately
("neither a built-in type nor... another model"). Nothing was lost because
nothing had been committed, but it is why every model-editing script in this
project now asserts the text it expects to find actually exists before
replacing it — an old lesson, relearned once.

**Environment note:** partway through this step the local Docker daemon
stopped entirely (not just the database container) — a host-level issue, not
caused by anything in this repository. Restarting it needed a password only
the user has, which the sandbox does not. Recorded because it is exactly the
kind of interruption `scripts/setup.mjs`'s Docker check (step 7) exists to
give a clear message for, rather than an obscure connection-refused error.

---

## Step 10 — Supervision: site visits, observations, instructions ✅

The second of Phase 2's three modules (`docs/phase-2-plan.md`). Unlike
planning's activities and milestones, none of the three entities here is
archived, and none carries a status column at all — PRD §6 gives observations
and instructions no lifecycle of their own, and a site visit is simply a fact
once it has happened. The one structural difference from every module so far:
observations and instructions are reached through a site visit, not the
project directly, so they are the first records in the system checked against
**two** levels of nesting.

**Built:** `site_visit`, `observation` and `instruction` tables; list/create/
edit for site visits (belonging to a project); list/create/edit for
observations and instructions (belonging to a site visit). The Phase 2
permission catalogue needed no changes — `supervision:view/create/edit` was
already seeded in step 9's migration, ahead of this module, the same approach
step 4 used for the whole Phase 1 matrix.

**Endpoints:** `/projects/:projectId/supervision/site-visits`,
`.../site-visits/:siteVisitId/observations`,
`.../site-visits/:siteVisitId/instructions`.

**Verified — 10 tests, all against the real database:**

| Behaviour                                                               | Result                  |
| ----------------------------------------------------------------------- | ----------------------- |
| A non-member holds neither `supervision:view` nor `supervision:create`  | ✅                      |
| The project member holds both                                           | ✅                      |
| Create, list and edit a site visit                                      | ✅                      |
| A stale edit to a site visit is refused                                 | ✅ `STALE_RECORD`       |
| A site visit reached through the **wrong project** in the URL           | ✅ `NOT_FOUND`          |
| Create and list an observation on a site visit                          | ✅                      |
| An observation reached through a site visit from the **wrong project**  | ✅ `NOT_FOUND`          |
| An instruction is marked actioned by setting `actionedAt`, not a status | ✅                      |
| Creating an instruction is audited                                      | ✅                      |
| **No supervision record can be created on a closed project**            | ✅ `ILLEGAL_TRANSITION` |

**Decisions:**

- **No `archived_at` on any of the three tables, and no archive endpoint.**
  PRD §6 gives none of them a reason to be hidden — a completed site visit is
  a historical record the same way a closed project is, not a task that gets
  tidied away. This is a deliberate difference from planning's activities and
  milestones, which are archived because they behave like a to-do list.
- **`instruction.actionedAt` is set through the normal edit endpoint**,
  exactly the treatment `Milestone.achievedDate` got in step 9 — a date is
  either present or it is not, and that is the whole state, so a dedicated
  "action" route would be a transition table for something that isn't a
  transition.
- **Observations and instructions are checked against two levels of
  nesting**, not one: `requireSiteVisit` confirms the site visit named in the
  URL belongs to the project also named in the URL, and each service then
  confirms the observation or instruction belongs to that site visit. This is
  the same shape of bug step 6 found and fixed for workstreams — a nested
  route can reach into the wrong parent if only one level is checked — applied
  here before it had the chance to appear rather than after.
- **`requireOpenProject` is duplicated from the planning module, not
  imported.** A module may only reach into another module's `index`, and this
  helper is deliberately not part of either module's public surface — the
  same module-boundary discipline step 0 built CI around.
- **`supervisionListQuerySchema` drops `includeArchived`** rather than reusing
  `listQuerySchema`, because none of these three tables has anything for that
  field to filter. Sending a query parameter with nothing behind it would
  have been a silently-ignored option, not a real one.

**Known limit, recorded rather than discovered later:** an observation has no
link forward to the issue it may turn into — PRD §6's "record observations and
instructions" and the separate "Site Visits and Issues" section describe
Issue as its own entity, and step 11 will decide whether `Issue.observationId`
is worth adding as an optional reference. Nothing here forecloses it; the
column simply does not exist yet.

---

## Step 11 — Issues: the fourth state machine ✅

The third and last of Phase 2's three modules, and the one named directly in
`phase-1-plan.md` §5a alongside Project, Approval and Drawing revision. It
resolved step 10's open item: `Issue.observationId` is a real, optional
foreign key, so something seen on a site visit can be tracked forward to
closure without a rewrite of either module.

**Built:** `issue` table; list/create/edit; the four named transitions
(`start`, `resolve`, `close`, `reopen`) enforced the same three-layer way
`ProjectService.transition` established in step 6 — a named action, a
transition table, and a write conditional on the state actually still being
what was read. No permission or migration work was needed for the catalogue;
`issue:view/create/edit/close` was seeded in step 9, three steps ahead of this
module, the same pattern used throughout Phase 1 and 2.

**Endpoints:** `/projects/:projectId/issues`,
`.../issues/:id/{start,resolve,close,reopen}`.

**Verified — 15 tests, all against the real database:**

| Behaviour                                                                 | Result                  |
| ------------------------------------------------------------------------- | ----------------------- |
| A non-member holds neither `issue:view` nor `issue:create`                | ✅                      |
| The project member holds `view`, `create` **and `close`**                 | ✅                      |
| The Director holds `view` only, no `create` or `close`                    | ✅                      |
| An issue is created at `OPEN` with the seeded default severity/priority   | ✅                      |
| An issue is created carrying an observation from the **same** project     | ✅                      |
| An issue pointed at an observation from **another** project is refused    | ✅ `CONFLICT`           |
| A stale edit to an issue is refused                                       | ✅ `STALE_RECORD`       |
| An issue reached through the **wrong project** in the URL                 | ✅ `NOT_FOUND`          |
| The full walk: `Open → In Progress → Resolved → Closed → Open` (reopened) | ✅                      |
| Reopening **directly from Resolved**, skipping Closed                     | ✅                      |
| Skipping straight from `Open` to `Resolved` is refused                    | ✅ `ILLEGAL_TRANSITION` |
| The refused transition is recorded, not only the ones that happened       | ✅                      |
| A transition made from a stale version is refused                         | ✅ `STALE_RECORD`       |
| **No issue can be created on a closed project**                           | ✅ `ILLEGAL_TRANSITION` |
| Every seeded issue permission exists in the shared catalogue              | ✅                      |

**Decisions:**

- **`issue:close` guards exactly the `close` route, nothing else.** `start`,
  `resolve` and `reopen` all sit behind `issue:edit`. This is the identical
  split `project:close` already established in step 6 — PRD §3 names issue
  closure as Supervision Team's specific responsibility, separate from
  general editing, and the seeded matrix (step 9) already gives Project
  Manager and Supervision Team both permissions together, so the split has no
  observable effect yet but is the correct shape for the day a role holds one
  without the other.
- **`Issue.observationId` is a real foreign key, checked against the project
  in the URL at create time** — not merely stored. An observation belongs to
  a site visit, which belongs to a project; accepting an observation id
  without checking its project would let a caller raise an issue against one
  project while quietly linking evidence from another's site work. Refused
  with `CONFLICT`, the same code `Property`/`Client` mismatches use in
  step 6, because this is the same shape of problem: a reference that exists,
  just not where the caller claimed.
- **Severity and priority default to `MEDIUM`** rather than being required
  choices, per `phase-2-plan.md` §5's "starts permissive" rule — nothing
  forces a caller to classify urgency before a record can exist at all.
  Both are still database `CHECK` constraints against the catalogue, the
  same discipline every status-shaped column in this system gets.
- **`closureNotes` is an ordinary field, set through the normal edit
  endpoint, not through the `close` transition.** PRD §6 does not require
  closure evidence to close an issue, so tying the two together would make a
  transition responsible for validating content it does not need to. The
  transition's own `reason` field (mirroring `ProjectTransition`) covers the
  ad hoc "why this move, right now" case; `closureNotes` is the durable
  record on the issue itself.
- **`requireOpenProject` is duplicated a third time**, in this module too.
  Three copies of an eight-line function is the price module-boundary
  enforcement charges for not letting modules share internals — paid
  knowingly, the same trade step 10 already made explicit.

**Bug caught while writing the tests, not the code:** the first version of
the stale-version test called the same named action (`start`) twice in a row
to simulate two callers racing. The second call legitimately hit
`ILLEGAL_TRANSITION` instead of `STALE_RECORD`, because by the time it ran the
issue's real status had already moved to `IN_PROGRESS` — `start`'s own target
is no longer reachable from there, regardless of which version was named. The
transition check reads status fresh, not the version the caller last saw, so
a repeated action and a genuinely stale write are different failures and need
different actions to tell them apart: the fixed test races `start` against
`resolve`, which is legal from the fresh state, so the conflict it hits is the
version check, not the transition table.

---

## Step 12 — Web interface for Phase 2 ✅

The last step of Phase 2, and the one that makes planning, supervision and
issues usable by somebody who is not holding a terminal — the same role
step 8 played for Phase 1.

**Built:** nested routes under a project for all three modules —
`/projects/:id/planning` (activities, milestones and submissions, one page,
three cards — the same shape the project page already gives workstreams and
team membership), `/projects/:id/supervision` and its site-visit detail page
(`/projects/:id/supervision/:siteVisitId`, with observations and
instructions), and `/projects/:id/issues` with its own detail
(`/projects/:id/issues/:issueId`) and create (`/projects/:id/issues/new`)
pages. A "Raise issue" link on each observation row carries its id into the
issue-creation form via a query parameter, so an issue can be raised from the
exact observation it was looking at without a picker that would need every
observation across the project fetched up front.

**Verified — 18 browser tests, all passing together (12 from Phase 1, 6 new for Phase 2):**

| Behaviour                                                                     | Result |
| ----------------------------------------------------------------------------- | ------ |
| The three Phase 2 links appear on a project of type `BOTH`                    | ✅     |
| An activity is created, listed, and marked done                               | ✅     |
| A milestone is created and marked reached                                     | ✅     |
| A submission is created and moved `DRAFT → SUBMITTED`                         | ✅     |
| A site visit, an observation and an instruction are recorded                  | ✅     |
| An instruction is marked actioned                                             | ✅     |
| An issue is raised from an observation, carrying the link                     | ✅     |
| The issue walks `Open → In Progress → Resolved → Closed → Open` (reopened)    | ✅     |
| **A non-member gets nothing for planning, supervision or issues** — HTTP ≥400 | ✅     |
| No unexpected refusal banner appeared along the way                           | ✅     |

**Decisions:**

- **Planning gets one page for three entities; supervision and issues get
  detail pages of their own.** The difference is not arbitrary: an activity,
  a milestone and a submission are each fully described by one table row plus
  an inline action, the same treatment `Workstream` got in step 8. A site
  visit and an issue both own children or enough fields to need a page — the
  same reasoning that gave `Project` a detail page and `Workstream` only a
  table row, applied one level down.
- **No dedicated edit page for any Phase 2 entity.** `docs/phase-2-plan.md`
  §7 asks for "list/detail/create" screens, not "list/detail/create/edit" —
  and every Phase 2 entity's mutable state turns out to be either a targeted
  action (mark done, mark reached, mark actioned, a named transition) or, for
  Issue specifically, a small set of fields (severity, priority, owner, due
  date, closure notes) folded into the detail page rather than a fourth
  screen. This is a deliberate, narrower shape than Phase 1's full CRUD
  pages, not an oversight — Phase 2's records are workflow-driven, not
  freely-editable documents.
- **`closureNotes` and the other editable issue fields share one form on the
  issue's own detail page**, next to the transition buttons, rather than a
  `/edit` route. Both are "the same page, different concerns" — status moves
  through actions, everything else through one small form — matching how the
  project page already puts transitions and team management side by side
  without pretending they are one feature.

**Bug found and fixed, by running it rather than reading it:** the Planning
page places three separate create forms on one screen — the first time in
this codebase two forms on the same page have used a field called `name`.
`Field`'s `id` is derived directly from its `name` prop, so the activity
form's "Name" input and the milestone form's "Name" input both rendered
`id="name"` — invalid HTML, and it broke label association badly enough that
the accessible name computed for one of the two inputs came out as "Name
Name" and the other as nothing at all. Neither `tsc` nor `eslint` has any way
to catch a duplicate DOM id; only opening the page and driving it with
Playwright surfaced it. Fixed by naming the second field `milestoneName` — a
reminder that any page combining more than one simple create form needs its
field names checked for collisions, not just its logic.

**Known limits, recorded rather than discovered later:**

- **No picker for linking an issue to an observation from the issue-creation
  screen directly** — only the one-click path from the observation's own row.
  Deliberate for now: a full picker would need every observation across the
  project fetched up front (there is no "all observations for a project"
  endpoint, only "observations for a site visit"), for a feature the PRD
  treats as occasional, not routine.
- **Lists on these new pages fetch up to 100 rows and do not page**, the same
  known limit step 8 recorded for Phase 1's lists, now true of six more of
  them.

---

## Step 13 — Approvals: the shared state machine ✅

The first step of Phase 3 (`docs/phase-3-plan.md`), and deliberately first: it
needs neither a new table nor a Google Drive dependency, and it is what makes
Phase 2's submissions stop being stuck at `SUBMITTED`.

**Built:** `ApprovalStatus`/`APPROVAL_TRANSITIONS`/`canTransitionApproval` in
`@ecms/contracts` — the one shared implementation architecture-discussion §6.4
(decision A6) asks for. `Submission.status` grows from `{DRAFT, SUBMITTED,
WITHDRAWN}` to the full approval set plus `WITHDRAWN`, exactly as promised in
step 9. Submission's transition endpoint changed from a single generic
`POST .../status {to, version}` route to six named-action routes — `submit`,
`review`, `approve`, `reject`, `returnForRevision`, `withdraw` — matching the
"no generic set status" rule (`phase-1-plan.md` §5a) that Project and Issue
already followed and Submission, until now, did not. The one new permission,
`planning:approve`, is the first real use of the `approve` verb PRD §8 named
back in step 4.

**Endpoints:** `/projects/:projectId/planning/submissions/:id/{submit,review,
approve,reject,return-for-revision,withdraw}`.

**Verified — 5 new tests (111 total in the API suite):**

| Behaviour                                                                                   | Result                  |
| ------------------------------------------------------------------------------------------- | ----------------------- |
| A submission cannot skip `UNDER_REVIEW` straight to a decision                              | ✅ `ILLEGAL_TRANSITION` |
| A full walk: submit → review → returned for revision → resubmit → review → approve          | ✅                      |
| **A reviewer approving their own submission is refused**                                    | ✅ `FORBIDDEN`          |
| …but rejecting or returning their own submission is not — not the same conflict of interest | ✅                      |
| `planning:approve` is held by Director and Planning Team, not Project Manager               | ✅                      |

**Decisions:**

- **One shared transition table in contracts, not one shared database
  table.** Architecture-discussion §6.4 asks for "a single reusable approval
  state machine, not per-workflow duplication" and frames it as a polymorphic
  `ApprovalRequest` entity. This codebase's own idiom — a transition table
  and function per state machine, living in `@ecms/contracts`
  (`PROJECT_TRANSITIONS`, `SUBMISSION_TRANSITIONS`, `ISSUE_TRANSITIONS`) —
  already achieves the same goal ("one place the rule lives") without a
  denormalised table joining unrelated entities. `Submission` composes the
  shared table with one submission-specific edge (`WITHDRAWN`) rather than
  copying it; `DrawingRevision` will consume the same shared table unchanged
  in step 14.
- **Self-approval is refused for `approve` only, not `reject` or
  `returnForRevision`.** The conflict of interest is specifically in
  rubber-stamping your own work; sending it back or refusing it carries no
  equivalent incentive to abuse. Checked in the service, next to
  `requireOpenProject`, not as a fourth permission — the matrix says who may
  approve _something_, not whose.
- **`planning:approve` sits on the existing `planning` resource**, not a new
  `approval` resource, matching how `issue:close` already sits on `issue`
  rather than a separate `closure` resource — the verb belongs to the thing
  it governs.
- **The matrix comes from PRD §3's own role descriptions**, already sitting
  unused in `ROLE_DEFINITIONS` since step 4: Planning Team's is "submissions,
  drawings **and approvals**"; Director's is "dashboards **and approvals**".
  Project Manager's description says neither, and holds no approve grant.

**Bug found while writing the tests, not the code:** `RETURNED_FOR_REVISION`
is 21 characters; `Submission.status` was `VarChar(20)`, one character short.
Prisma's own type-checking had nothing to say about it — the failure surfaced
only as a database error the moment a real transition tried to write the
value, in `walks a submission through the full approval lifecycle`. Fixed by
widening the column to `VarChar(30)`, and worth a general lesson: a CHECK
constraint that lists literal values does not protect against one of those
literals being longer than the column that holds it.

**Also found while writing the tests:** an early version of the
"no further without a reviewer" test tried to prove `SUBMITTED` cannot jump
straight to `APPROVED`, but used the submission's own creator as the actor —
which tripped the self-approval refusal instead of the transition-table
check, the same "two different failures, pick the action that isolates one"
lesson step 11 already learned. Fixed by deciding with `admin`, who created
nothing here.

---

## Step 14 — Drawings: append-only, immutable-when-approved ✅

The second step of Phase 3, and the highest-risk database work in the
project so far — the one `docs/phase-3-plan.md` §5 and
architecture-discussion decision A3 call the strictest invariant in the
system: once a drawing revision is approved, nothing may change it, not
even a bug or a hand-run `UPDATE`.

**Built:** `drawing` and `drawing_revision` tables; `DrawingService`
(register/list/read — no update, deliberately) and `DrawingRevisionService`
(create, list, read, and the five named approval actions); a database
trigger that refuses every `UPDATE` and `DELETE` on an `APPROVED` revision
except the one write that sets `supersededAt`. `DrawingRevision.status`
reuses `ApprovalStatus`/`canTransitionApproval` from step 13 directly, with
no submission-style extra edge — the "one shared implementation" promise
made when Approvals was built now has its second consumer.

**Endpoints:** `/projects/:projectId/drawings`,
`/projects/:projectId/drawings/:drawingId/revisions`,
`.../revisions/:id/{submit,review,approve,reject,return-for-revision}`.

**Verified — 16 tests, all against the real database:**

| Behaviour                                                                           | Result                  |
| ----------------------------------------------------------------------------------- | ----------------------- |
| A non-member holds neither `drawing:view` nor `drawing:create`                      | ✅                      |
| The project member (Planning) holds `view, create`, **not** `approve`               | ✅                      |
| Director holds `view, approve` globally, **not** `create`                           | ✅                      |
| A drawing is created with no current revision                                       | ✅                      |
| A duplicate drawing number on the same project is refused, case-insensitively       | ✅ `CONFLICT`           |
| A first revision becomes the drawing's current revision                             | ✅                      |
| A duplicate revision code on the same drawing is refused                            | ✅ `CONFLICT`           |
| **A second revision supersedes the first**, which is no longer current              | ✅                      |
| A revision walks Draft → Submitted → Under Review → Approved                        | ✅                      |
| **An approved revision refuses a direct `UPDATE` — bypassing the service entirely** | ✅ database trigger     |
| **An approved revision refuses `DELETE` outright**                                  | ✅ database trigger     |
| …but a later revision may still supersede it                                        | ✅                      |
| Skipping straight from `Draft` to `Approved` is refused                             | ✅ `ILLEGAL_TRANSITION` |
| The refused transition is recorded, not only the ones that happened                 | ✅                      |
| A transition made from a stale version is refused                                   | ✅ `STALE_RECORD`       |
| A drawing or revision reached through the wrong project/drawing in the URL          | ✅ `NOT_FOUND`          |
| **No drawing or revision can be created on a closed project**                       | ✅ `ILLEGAL_TRANSITION` |
| Every seeded drawing permission exists in the shared catalogue                      | ✅                      |

**Decisions:**

- **No `drawing:edit` permission, and no update route for either model.** A
  drawing's number and title are set once; a revision's content may never
  change once written. `drawing:create` covers registering a drawing,
  uploading a revision, and the two ordinary progression actions (`submit`,
  `review`); `drawing:approve` covers only the three decisions (`approve`,
  `reject`, `returnForRevision`) — mirroring how `issue:close` sits beside
  `issue:edit` rather than folding into it, but here there is no "edit" at
  all for the verb to sit beside.
- **`currentRevisionId` on `Drawing` and `supersededAt` on `DrawingRevision`
  both exist, and both matter.** The FK column is the convenient read path;
  the partial unique index (`drawing_id` `WHERE superseded_at IS NULL`) is
  the actual guarantee, independent of the FK ever drifting — the same
  belt-and-suspenders relationship a CHECK constraint has with the named
  actions that are supposed to keep a status column honest.
- **The immutability trigger checks every column except `superseded_at`**,
  rather than allow-listing what it protects. A future column added to
  `drawing_revision` is protected by default; someone would have to
  deliberately add it to the trigger's exemption to make it editable on an
  approved row, which is the safer direction to require someone to opt into.
- **Superseding is unconditional on the previous revision's status.**
  Whether the outgoing revision was `APPROVED`, `REJECTED`, or still
  `DRAFT`, creating the next one retires it from being current. Only one
  revision is ever "in flight" per drawing, matching how a real drawing
  register works — revision 2 supersedes revision 1 the moment it exists,
  not only once revision 1 has been decided.

**Bug found by running it, not by reading it:** the first version of
`DrawingRevisionService.create` inserted the new revision **before**
superseding the old one. For the instant between those two statements, two
rows for the same drawing both held `superseded_at = NULL` — exactly what
`uq_drawing_revision_current` exists to refuse, and partial unique indexes
are checked immediately, not deferred to the end of the transaction. Neither
`tsc` nor a code read caught it; only actually creating a second revision
did, in the `supersedes the previous current revision` test. Fixed by
superseding first, inserting second — the same lesson as step 6's "the
audit row for a refusal needs its own transaction": statement order inside
a transaction is not free of consequence just because it will all commit or
none of it will.

**Also caught while writing the tests:** an assertion that Planning Team
holds `drawing:approve` — copied, without checking, from step 13's
`planning:approve` matrix. `docs/phase-3-plan.md` §9's own table gives
Planning Team `view, create` for drawings specifically, not `approve`; only
Director and System Administrator get that here. The seed migration was
right; the test's expectation, carried over from a different permission on
a different resource, was not.

---

## Step 15 — Documents: register, metadata and the Drive seam ✅

The third step of Phase 3, and the one that finally answers what everything
since step 1 has been building toward for files: business metadata in this
database, actual bytes behind an adapter interface, never the reverse
(architecture-discussion §6.5, decision A5).

**Built:** the `document` table; `DocumentService` (list/read/create/edit/
archive/download); the `DriveAdapter` interface and its only implementation
so far, `LocalDriveAdapter`, which writes to a directory on disk and returns
a fabricated-but-stable file id — injected everywhere through a DI token
(`DRIVE_ADAPTER`) rather than a concrete class, so a real `GoogleDriveAdapter`
is a provider swap, not a rewrite, once B7 is answered. The write flow is
three separate steps, not one transaction, matching architecture-discussion
§6.5 literally: create the row `PENDING` and commit; upload the bytes outside
any open transaction; write the outcome — `ACTIVE` with the file id, or
`FAILED` — last. `Document` is deliberately **not** run through
`ApprovalStatus` — see step 13's and `docs/phase-3-plan.md` §4's reasoning,
unchanged. `linkedType`/`linkedId` let a document point at an activity, site
visit, issue or submission on the same project, checked at the point of use
rather than as a real foreign key, the same trade `PlanningActivity.assigneeId`
already makes.

**Endpoints:** `/projects/:projectId/documents` (list, create — multipart,
one `file` field plus metadata), `.../documents/:id` (read, edit, archive),
`.../documents/:id/content` (download the raw bytes).

**Verified — 14 tests, all against the real database and a real filesystem:**

| Behaviour                                                                                                       | Result                  |
| --------------------------------------------------------------------------------------------------------------- | ----------------------- |
| A non-member holds neither `document:view` nor `document:create`                                                | ✅                      |
| The project's Document Controller holds view, create, edit **and archive**                                      | ✅                      |
| Planning Team on the project holds view only, not create or archive                                             | ✅                      |
| Director holds view only, globally, and no create                                                               | ✅                      |
| **A document is registered, uploaded through the `LocalDriveAdapter`, and downloaded back byte-for-byte**       | ✅                      |
| **An upload that never completes is marked `FAILED`, not left `PENDING` forever, and download is then refused** | ✅                      |
| A document is linked to an activity on the same project                                                         | ✅                      |
| A link to an activity on **another** project is refused                                                         | ✅ `CONFLICT`           |
| A link to an activity that does not exist is refused                                                            | ✅ `NOT_FOUND`          |
| Metadata edits under optimistic locking; a stale edit is refused                                                | ✅ `STALE_RECORD`       |
| Archiving hides a document from an ordinary list but not from `includeArchived`                                 | ✅                      |
| A document reached through the wrong project in the URL                                                         | ✅ `NOT_FOUND`          |
| **No document can be created on a closed project**                                                              | ✅ `ILLEGAL_TRANSITION` |
| Every seeded document permission exists in the shared catalogue                                                 | ✅                      |

**Decisions:**

- **The write flow is three steps, not one transaction, on purpose.**
  External I/O — writing bytes to disk today, a real Drive API call once B7
  is answered — has no place inside an open database transaction; a slow or
  hung upload would otherwise hold a lock the whole time. The `PENDING` row
  is committed before the upload starts, so a crash mid-upload leaves a
  record that an attempt was made, not silence.
- **`DriveAdapter` is injected by a Symbol token, not a concrete class.**
  `docs/phase-3-plan.md` §7 promises "nothing above the adapter changes"
  when the real `GoogleDriveAdapter` arrives; that promise only holds if
  `DocumentService` depends on the interface, not on `LocalDriveAdapter`
  specifically. The test suite exploits the same seam the other direction —
  a `FailingDriveAdapter` stub is what proves the `FAILED` path without
  needing to break a real filesystem.
- **Archive, not delete, and the underlying file is left in place.** The
  same posture Client and Property took in step 5 — PRD §6 forbids
  destructive removal, and a document nobody can currently see may still be
  what a later audit needs. Unlike Client's archive, there is no dependency
  check: nothing in this system points at a document the way a project
  points at a client.
- **No re-upload, and `linkedType`/`linkedId` are set once, at creation.** A
  new file is a new document — the same shape a new drawing revision is a
  new row, not an edit to the old one — and the edit endpoint touches only
  `category`, `title` and `description`.
- **`Document` is not run through `ApprovalStatus`.** Unchanged from
  `docs/phase-3-plan.md` §4: most documents this system will hold have no
  approval step in practice, and forcing one onto every uploaded file is
  exactly the complexity PRD §22 asks to avoid until the business needs it.
- **The four `linkedType` targets are a flat, one-hop lookup**, not
  `IssueService`'s two-hop check through an observation's site visit —
  `PlanningActivity`, `SiteVisit`, `Issue` and `Submission` all carry
  `projectId` directly, so there is no intermediate table to walk through
  first.
- **`linked_type` is a database `CHECK` constraint even though it is not a
  foreign key.** It is still a closed catalogue, and a typo here should fail
  loudly rather than sit silently in a document nothing can later find by
  its link — the same discipline every status-shaped column in this system
  gets.

**Known limit, recorded rather than discovered later:** the PRD's "maintain
revision and access history" line for documents (§6) is only partly met.
Every create, edit, archive and status change is audited — that is the
access history — but there is no document-revision table the way
`DrawingRevision` exists for drawings; re-uploading a corrected file today
means registering a new document, with no link back to the one it replaces.
`docs/phase-3-plan.md` §6 scopes Document this way deliberately (a flat
register, no revision concept), and nothing built here forecloses adding one
later if the client's real usage needs it.

**Also carried forward, unchanged:** the Drive integration itself is still
`LocalDriveAdapter` only — B7 (`docs/phase-3-plan.md` §7, §9B) remains
unanswered, and the reconciliation job architecture-discussion §6.5 asks for
is still a stub with nothing real to reconcile against. Both wait on the
same external account this environment does not have, same as step 14 left
them.

---

## Step 16 — Web interface for Phase 3 ✅

The last step of Phase 3, and the one that makes drawings and documents
usable by somebody who is not holding a terminal — the same role step 8
played for Phase 1 and step 12 for Phase 2.

**Built:** `/projects/:id/drawings` (list, register a drawing) and
`/projects/:id/drawings/:drawingId` (the revision timeline — the one
genuinely new UI pattern in this application: a table of every revision,
most-recent-first, the row with no `supersededAt` marked "Current" and
every other one marked "Superseded", each row's own transition buttons
filtered by `canTransitionApproval` the same way the planning page already
filters Submission's); `/projects/:id/documents` (list, upload a document —
the first real file input and the first real file upload in this
application) and `/projects/:id/documents/:documentId` (metadata, a
download link, an edit form). Two new buttons on the project page,
alongside Planning/Supervision/Issues, gated by `drawing:view` and
`document:view` and — unlike those three — not conditional on the
project's type, since neither drawings nor documents belong to one
workstream kind over the other.

**Also built, because a document's bytes cannot be JSON:** `api.postForm`
in `apps/web/src/lib/api.ts`, sending a `FormData` body with no explicit
`content-type` header so `fetch` fills in the multipart boundary itself;
a `stream()` helper and a route handler at
`/projects/:id/documents/:documentId/content` that proxies the API's own
download endpoint straight through, cookie forwarded the same way every
other call is — the browser still never learns the API's address, and the
API still makes the only real `document:view` decision, this route is a
pass-through, not a second permission check. A `FileField` component was
added to `components/form.tsx`, the only form in this application that
needs a real `<input type="file">`.

**Verified — 7 new browser tests, 25 passing together (12 from Phase 1, 6
from Phase 2, 7 new):**

| Behaviour                                                                                                          | Result |
| ------------------------------------------------------------------------------------------------------------------ | ------ |
| The Drawings and Documents links appear on a project page                                                          | ✅     |
| A drawing is registered, a revision is uploaded, and walks Draft → Submitted → Under review → Approved             | ✅     |
| **A second revision supersedes the first** — the timeline shows one "Current" and one "Superseded"                 | ✅     |
| **A document is registered, a real file is uploaded, and downloaded back byte-for-byte** through the route handler | ✅     |
| Archiving a document hides it from the ordinary list                                                               | ✅     |
| **A non-member gets nothing for either route** — HTTP ≥ 400                                                        | ✅     |
| No unexpected refusal banner appeared along the way                                                                | ✅     |

**Decisions:**

- **The drawing-revision timeline needed no new primitive.** `Card`,
  `table`, `Badge` and `DateText` — the same pieces every Phase 1 and 2 list
  page already uses — were enough; "current" vs "superseded" is one
  conditional, not a new component.
- **`ACTIONS` arrays, filtered by the shared transition table, are copied
  once more.** The drawing detail page's `ACTIONS`/`available` shape is
  line-for-line the pattern the project page established for
  `PROJECT_TRANSITIONS` and the planning page repeated for
  `SUBMISSION_TRANSITIONS` — a fourth consumer of the same idiom, not a
  new one invented for drawings.
- **No linking UI for a document to an activity, site visit, issue or
  submission.** The API supports `linkedType`/`linkedId` (step 15); the web
  form does not expose it, the same deliberate gap step 12 left for an
  issue's `observationId` — a full picker across four different tables'
  records would need all of them fetched up front, for a feature the PRD
  treats as occasional rather than routine. Nothing here forecloses adding
  a picker, or a one-click carried-link path the way "Raise issue" carries
  an observation, later.
- **The download route is a proxy, not a second authorization check.** It
  forwards the session cookie and returns whatever the API answers,
  including a refusal — deciding `document:view` twice, in two languages,
  is exactly the kind of duplicated rule this codebase has avoided
  everywhere else.
- **`api.postForm` and `request`/`login` now share one `parseResponse`
  helper.** `login` previously duplicated the same parse-and-throw block
  `request` used; adding a third caller for multipart bodies was the
  moment to stop copying it a second time rather than a third.

**Known limit, recorded rather than discovered later:** lists on these two
new pages fetch up to 100 rows and do not page, the same limit recorded in
steps 8 and 12 and now true of two more of them.

**Environment note, not a defect in the code:** running the browser suite
in this sandbox required working around two things neither prior step
hit: an unrelated process already bound to port 3000 on this shared
machine (worked around by starting the web server on a different port and
pointing Playwright's `WEB_URL` at it — no committed file changes), and
the in-memory sign-in rate limiter (`docs/PROGRESS.md` step 4's known
limit) tripping after many repeated manual re-runs against one long-lived
API process — cleared by restarting it. Both are artifacts of this
particular sandbox session, not of the application.
