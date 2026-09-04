# Progress

Running record of what has been built, what was verified, and what changed along the way.
Updated at the end of every step.

**Phase 1 — Foundation** (PRD §20): authentication, users, roles, clients, properties, projects. Complete.

**Phase 2 — Core Operations** (PRD §20): planning, supervision, site visits, observations, instructions and issues. See `docs/phase-2-plan.md`.

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
| 10   | Supervision — site visits, observations, instructions  | ⬜ Next |
| 11   | Issues — the fourth state machine                      | ⬜      |
| 12   | Web interface for Phase 2                              | ⬜      |

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
