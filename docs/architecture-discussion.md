# Architecture Discussion Document — Engineering Consultancy Management System (ECMS)

> **Document:** Architecture Discussion Document (Phase 1 deliverable).
> **Status:** Reviewed and approved. Decisions in §9A are settled — see `phase-1-plan.md` for what has been built since.
> **Audience:** technical stakeholders, and the client for the open questions in §9B.
> **Sources:** `Final_PRD_Engineering_Consultancy_Management_System.docx` (primary requirement source) · `/opt/jioid/uifp-v2/` (**structural reference only** — how a codebase is organised, and its environment-setup concept. **No implementation logic, code, or domain concept is carried across.** Studied in order to _improve on it_, not inherit it).

---

## Context

We are starting a new, business-critical system to manage the full lifecycle of engineering consultancy projects: clients, properties, projects, planning, supervision, site operations, documents, drawing revisions, approvals, handover, and audit history. The PRD is written and stable; nothing has been built yet — the working directory is empty.

The goal of this phase is **not** to pick frameworks. It is to establish: what the system actually has to do, where the real risk concentrates, what boundaries the code should be organised around, and which decisions need business input before anyone writes a line of code.

UIFP (`/opt/jioid/uifp-v2/`) is a fundamentally different system — an identity federation platform built for 500M+ records across six microservices.

**How UIFP is used here, precisely.** We look at it for **structure and organisation**: how a codebase is laid out, where tests sit relative to code, how modules are stopped from tangling into each other, naming conventions, and the _idea_ of a scripted, safe environment setup. We take **none** of its implementation — no code, no business logic, no error scheme, no authentication mechanism, no data-access patterns, no domain concepts, no infrastructure choices. Its architecture would be severe over-engineering at our scale. The value of studying it is to see what a mature codebase gets right structurally, **and where it falls short so we can do better.**

---

## 1. Repository Analysis Plan

| #   | Activity                              | Scope                                                                                                       | Status |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Extract and read PRD in full          | 325 lines, 22 sections                                                                                      | Done   |
| 2   | Classify PRD content                  | Explicit requirement vs. assumption vs. unknown                                                             | Done   |
| 3   | UIFP — structural practices           | Code organisation, module boundaries, testing layout, type-safety enforcement, CI shape, project rules file | Done   |
| 4   | UIFP — installation/bootstrap concept | `tools/`, `docker-compose.yml`, `deploy/`, migration+seed ordering, idempotency                             | Done   |
| 5   | Structural lessons matrix             | LEARN FROM / IMPROVE ON / REJECT verdicts                                                                   | Done   |
| 6   | Security gap analysis                 | OWASP ASVS-framed, ECMS-specific risks                                                                      | Done   |
| 7   | Target architecture options           | Technology-neutral; responsibilities and boundaries first                                                   | Done   |
| 8   | Decisions requiring discussion        | Split: recommended / needs business input / deferrable / risks                                              | Done   |

**Deliberately out of scope for this phase:** application code, project scaffolding, database migrations, framework selection, any modification to UIFP or the PRD.

---

## 2. PRD Analysis Summary

### 2.1 Business domains

Derived from PRD §4 (Core Business Structure), §5 (Core Modules) and §6 (Functional Requirements). The PRD's own hierarchy is:

`Client → Property → Project → Workstream/Module → Activities → Documents/Records`

| Domain                   | PRD source | Nature                                                                  |
| ------------------------ | ---------- | ----------------------------------------------------------------------- |
| Identity & Access        | §3, §8     | Supporting — users, roles, permissions, configuration                   |
| Client Management        | §4, §6     | Core reference data                                                     |
| Property Management      | §4, §6     | Core reference data, belongs to a client                                |
| Project Management       | §4, §6     | **Core aggregate** — the unit of authorization and the hub of the model |
| Planning (workstream)    | §5, §6     | Core workflow                                                           |
| Supervision (workstream) | §5, §6     | Core workflow                                                           |
| Site Operations          | §6         | Visits, observations, instructions                                      |
| Issues                   | §6         | Tracked, assigned, state-machine driven                                 |
| Documents                | §5, §6, §7 | Metadata register; bytes live externally                                |
| Drawing Revision Control | §6         | **Highest integrity requirement** — history must be immutable           |
| Approvals                | §5, §6     | Cross-cutting workflow over multiple record types                       |
| Handover & Closure       | §5, §6     | Terminal project lifecycle                                              |
| Notifications            | §9         | Supporting                                                              |
| Audit                    | §10        | Supporting, cross-cutting, tamper-resistant                             |
| Dashboard & Reporting    | §9         | Read-side / query concern                                               |

### 2.2 Core entities (explicit in PRD)

Client, Property, Project, Workstream, Activity/Record, Document, Drawing, Revision, Approval, Site Visit, Observation, Instruction, Issue, Handover Checklist, Outstanding Item, User, Role, Permission, Audit Entry, Notification.

### 2.3 User roles (§3 — seven, explicit)

System Administrator · Management/Director · Project Manager · Planning Team · Supervision Team · Document Controller · Client/External Stakeholder (restricted, "when enabled").

### 2.4 Permissions (§8 — six verbs, explicit)

View · Create · Edit · Approve · Close · Admin.

> **Critical observation.** §8 mandates that RBAC "must be enforced by the backend, not only hidden in the user interface", and the View permission is described as "View **authorized** projects and records". The PRD therefore implies **project-scoped** access, but it defines permissions only as a flat role→verb matrix. Whether authorization is global-by-role or scoped by project membership is **not resolved by the PRD** and is listed in its own gap register (§17, "Roles"). This is the single most consequential unresolved design question — see §7.

### 2.5 Workflows and state transitions

| Workflow          | States                                                                           | Source                 |
| ----------------- | -------------------------------------------------------------------------------- | ---------------------- |
| Approvals         | Draft → Submitted → Under Review → Approved \| Rejected \| Returned for Revision | §6, **explicit**       |
| Issues            | Open → In Progress → Resolved → Closed                                           | §6, **explicit**       |
| Drawing revisions | Active revision vs. superseded; approved versions never overwritten              | §6, §12, **explicit**  |
| Project lifecycle | "Track lifecycle... and project status" — **states not enumerated**              | §6; flagged in §17     |
| Handover/closure  | Checklist → outstanding items → final/as-built docs → archived                   | §6, partially explicit |

§12 requires that workflow status transitions be **validated**, and §16 forbids silently replacing existing workflow behaviour.

### 2.6 Approval flows

Explicit: the six states above; record approver, date and comments; enforce approval permissions.
**Not specified:** single vs. multi-step approval, delegation, rejection/resubmission rules, whether approvals apply uniformly to drawings, documents, planning submissions and handover, or differ per type. §17 lists this as a decision required.

### 2.7 Drawing revision requirements (§6, §12, §16)

- Register drawing metadata.
- Maintain revision history **without overwriting approved versions**.
- Identify the current active revision.
- Clearly mark superseded versions.
- §16 explicitly prohibits an implementer from overwriting drawing revisions.
- **Not specified:** naming convention and revision numbering scheme (§17 gap).

### 2.8 Document management requirements (§6, §7)

- Metadata in the application database; files in Google Shared Drive.
- Link documents to projects, activities, visits, approvals and issues (**polymorphic association**).
- Maintain revision **and access** history.
- Controlled access.
- **Not specified:** document categories, required metadata fields, Shared Drive folder conventions (§17 gap).

### 2.9 Google Shared Drive integration (§7)

Explicit requirements:

- Application DB stores: document ID, title, category, revision, status, project link, uploader, timestamps, **Drive file ID**.
- Drive stores the actual files (PDFs, drawings, photographs, reports, spreadsheets).
- Predictable project/document folder conventions.
- Store Drive file IDs for reliable linking.
- Do **not** duplicate large engineering files in PostgreSQL.
- **Log integration failures and support safe retries.**
- §14: no privileged third-party credentials exposed in frontend code.

**Not specified (significant):** the Drive authentication model (service account vs. per-user OAuth), how Drive-side ACLs relate to application RBAC, behaviour when a file is moved/renamed/deleted directly in Drive, quota/rate-limit handling, and whether the app or Drive is authoritative on conflict. See §7 — this is where the most severe security and integrity risk sits.

### 2.10 Audit requirements (§10)

Record actor, affected record, action type, timestamp; important previous/new values where required; status transitions, approvals and closure events. **Audit history must not be editable by ordinary users.**

### 2.11 Backup and recovery (§13)

Automated DB backups · point-in-time recovery per platform capability and retention policy · recovery points before major schema or production releases · independent backup strategy where business policy requires · **regular restore tests in a non-production environment** · documented recovery responsibilities · explicit warning that HA is not a substitute for backups.
**Not specified:** RPO/RTO targets, retention duration, record retention policy for closed projects (§17 gap).

### 2.12 Reporting requirements

§9 defines dashboard content: portfolio summary, project status, upcoming milestones, overdue actions, open approvals and issues, recent site activity and document revisions, role-specific dashboards.
Management reports and KPIs are **explicitly undecided** (§17 gap).

### 2.13 Notification requirements (§9)

**In-app** notifications for assignments, approvals, due dates and important status changes. Email/SMS are _not_ mentioned. Which events notify whom is an open decision (§17 gap).

### 2.14 Client analysis gaps (§17 — the PRD's own register, verbatim scope)

Project lifecycle statuses · role capability matrix per module · approval rules (single/multi-step, delegation, rejection) · drawing naming and revision numbering · required site visit/observation/closure fields · issue severity, SLA and closure rules · document categories, metadata and Drive folder conventions · whether an external client portal is required · notification routing · required management reports and KPIs · retention policy for closed projects.

### 2.15 Non-functional requirements (§13, §14, §15)

Explicit: HTTPS in production · backend-enforced authN/authZ · RBAC · secure secret management · restricted database access · rate limiting and abuse protection · input validation · audit logging for critical operations · three separated environments (Development/Staging/Production) · no privileged third-party credentials in frontend code · linting, type checks and tests before deployment · version-controlled migrations · rollback plans for high-risk releases · post-deployment health verification.

**Conspicuously absent:** performance targets, availability/uptime targets, RPO/RTO figures, expected user count, concurrency expectations, and data volume. See §7 — sizing drives the deployment-topology decision.

### 2.16 Security-sensitive areas (derived from PRD content)

Project-scoped data access · document and drawing access · approval authority · issue closure authority · audit trail integrity · Google Drive credentials and Drive-side ACLs · role and permission administration · the optional external client/stakeholder access path.

### 2.17 Data integrity requirements (§12)

PostgreSQL as system of record · UUIDs or equivalent robust identifiers · foreign keys and constraints on critical relationships · archival/soft deletion for important historical records · document metadata separated from physical files · **migration for every schema change** · approved drawing history never overwritten · workflow status transitions validated · **transactions for critical multi-record operations** · destructive deletion prevented where dependent project history exists (§6).

### 2.18 Future scalability requirements

§2: "Support future growth without redesigning the core architecture."
§20 phases 5–6: dashboards, reporting, notifications, workflow improvements, then additional integrations, portal/mobile enhancements and automation.
§22: "Start simple but remain scalable" and "Avoid unnecessary complexity until business needs require it."

> The PRD's own principles explicitly favour **simplicity now, extensibility later**. This directly constrains how much of UIFP's infrastructure is appropriate to carry over.

### 2.19 Confirmed constraints (answered in review, 2026-08-30)

These close four of the open questions and materially constrain the architecture:

| Constraint             | Decision                                        | Architectural consequence                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD §11 stack          | **Default, challenge only on merit**            | Next.js + NestJS + PostgreSQL + Prisma is the working assumption. I validate it and raise objections only where a requirement genuinely conflicts.                                                                                                                |
| Deployment target      | **Not yet decided**                             | Architecture must stay hosting-agnostic. Anything that hard-binds to one platform (background-job mechanism, secret store, backup approach) must be kept behind a boundary and the trade-offs surfaced per option.                                                |
| Scale                  | **Under ~50 users**                             | **Decisive.** A modular monolith is the correct topology. Service decomposition, a message broker, a distributed config store, and connection pooling middleware are all unjustifiable here. This is the primary reason UIFP's _architecture_ must not be copied. |
| External client portal | **Out of scope now; design so it can be added** | Build internal-only. Keep one authorization choke point and a clean trust boundary so a restricted external surface is additive later, not a redesign. No second auth path is built now.                                                                          |

### 2.20 Classification of requirements

**A — Explicit PRD requirements** (build to these): the seven roles; six permission verbs; the Client→Property→Project→Workstream hierarchy; approval and issue state machines; drawing revision immutability; metadata-in-DB / files-in-Drive split with Drive file IDs; audit trail contents and non-editability; backend-enforced RBAC; transactions for critical multi-record operations; migration-per-schema-change; three environments; the release flow; the §16 implementation rules; the §18 colour palette and §19 UI direction.

**B — Reasonable architectural assumptions** (proposed, to be confirmed): authorization is project-scoped, not merely role-global; approvals are a shared workflow capability reused across record types rather than duplicated per module; documents attach polymorphically to several parent types; optimistic concurrency is the default for multi-user record editing; the Drive integration needs an outbox/reconciliation mechanism because it is a dual-write across two systems of record; audit is append-only and enforced by database privilege, not only by application code; in-app notifications are generated from domain events.

**C — Unknown, requires clarification** (do not design around a guess): everything in §17 above, plus RPO/RTO, expected scale, deployment target/hosting, the Google Drive authentication model, and whether Drive-side permissions must mirror application permissions.

---

## 3. UIFP Repository Findings

> Scope deliberately limited to **transferable engineering practices** and the **installation/bootstrap script concept**, per direction that ECMS and UIFP are different products. UIFP's domain, service decomposition and infrastructure are explicitly _not_ being mined as an architecture template.

### 3.1 The installation / bootstrap concept — the strongest transferable idea

UIFP separates environment provisioning into **three independently runnable layers with different destructiveness profiles**:

```
migrations (schema)  →  seed-env (config + secrets + bootstrap rows)  →  seed:data (demo fixtures)
```

The middle layer is the interesting one. Its design:

**a) The two-file model.** Everything non-secret lives in a version-controlled `config/<env>.json`; secrets live in a git-ignored `.env.<env>`. They are joined by a _name indirection_ — the committed config names the environment variable holding a secret, never the secret itself:

```ts
// tools/seed-env/src/types.ts:78-86
export interface ClientSeed {
  clientId: string;
  // Name of the env var (in .env.<env>) holding this client's plaintext secret.
  secretRef: string;
  scope: string[];
}
```

The result: an entire environment's shape is reviewable in a pull request while zero secrets touch git.

**b) One shared safety policy, applied to every backend.** A single five-line function decides what happens for every key, in every store:

```ts
// tools/seed-env/src/env-policy.ts:16-20
export function decide(env: Env, exists: boolean, override: boolean): WriteAction {
  if (!exists) return 'write';
  if (isProtected(env) && !override) return 'skip';
  return 'overwrite';
}
// types.ts:12 — PROTECTED_ENVS = { sit, replica, production }
```

Protected environments are **skip-by-default**: the first seed writes, every later run is a no-op unless someone passes `--override`. This is exhaustively unit-tested across the env × exists × override matrix. It converts "is this safe to re-run?" from a per-seeder judgement call into one auditable function — which in turn is what makes it safe to run bootstrap on _every_ deploy.

**c) Genuine `--dry-run`.** It walks the identical decision path and prints per-key write/overwrite/skip verdicts without generating key material, so the output can be handed to a reviewer before touching production.

**d) Ambiguous responses are fatal, not "missing."** The single best guard in the repository:

```ts
// tools/seed-env/src/seeders/vault.ts:26-31
if (response.ok) return true;
if (response.status === 404) return false;
// Any other status (auth failure, server error, sealed Vault) is NOT "missing" —
// refusing here prevents the caller from re-seeding over real existing secrets.
throw new Error(`Vault existence check for ${path} returned ${response.status}`);
```

**e) Other properties worth carrying:** component opt-in flags with hard-coded dependency ordering (`--postgres --etcd` still runs etcd first); need-based secret validation (never demand a credential this invocation won't use); a shared path-builder imported by _both_ the seeder and the runtime reader so writes and reads provably agree; outcome accounting (`written/overwritten/skipped` summary table) with failures collected rather than fail-fast; the seeder guarding on migration state and _warning_ rather than crashing; and baking the DB init script into the image so Compose and Testcontainers get an identical database.

### 3.2 Bootstrap weaknesses — instructive failures to avoid

These are as valuable as the successes, because each has a clear root cause:

| Weakness                                                                                                                                                                       | Root cause                                      | Lesson for ECMS                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Migrations and seeding are absent from CI/CD** — the pipeline builds, tests and starts, but the two steps that actually make a new tier work are undocumented manual actions | Bootstrap was treated as a human operation      | Make `bootstrap <env>` an explicit, idempotent pipeline stage. Skip-by-default is precisely what makes this safe |
| **Two live seeders** (`seed-local` superseded by `seed-env`, but still wired into the root `package.json` scripts) that have already drifted apart                             | Old implementation kept "for reference"         | One implementation. Delete the old one                                                                           |
| **Three incompatible environment vocabularies** across README, runtime env parser and the seeder's type definitions — the README's set matches nothing in the code             | The tier list was written down three times      | Define the environment enum **once**, export it, derive docs and config from it                                  |
| **Documented commands that do not exist** — a fresh-machine walkthrough fails on at least two steps                                                                            | Docs drifted from scripts, never executed in CI | Verify the bootstrap path in CI, or it will rot                                                                  |
| **No CAS anywhere** — every "create-only" guarantee is an advisory get-then-put with a TOCTOU window                                                                           | Fine for a human-run tool                       | Acceptable for ECMS too, but only if bootstrap stays single-runner. Note it consciously                          |
| **Config files ~90% identical**, with policy blocks repeated verbatim per service per environment                                                                              | No base + overlay layering                      | Use defaults + per-environment overrides from the start; otherwise one policy change means editing every file    |
| **Hardcoded internal IPs** duplicated between the process-manager config and the seeder config, able to disagree silently                                                      | Same value written in two places                | Single source for every environment coordinate                                                                   |
| **A drift-repair one-off script** committed to fix one environment by hand                                                                                                     | The tool had no verify/diff mode                | Build `--diff` into the tool from the start                                                                      |

### 3.3 Assessment for ECMS

The bootstrap **concept** is the most directly reusable thing in the entire reference repository, and it survives the scale difference intact — the value of "one policy function, protected environments, dry-run, config-in-git/secrets-out-of-git" does not depend on having six services or 500M records.

What must be **stripped**: the backends. UIFP seeds etcd, Vault and PostgreSQL because it has a distributed runtime-config store and a secrets manager. At under 50 users ECMS has neither. The same _shape_ applies to a much smaller target — database migrations, an application settings table, and whatever secret store the (undecided) hosting platform provides.

---

## 4. Best Practices Extraction Matrix

> **Scope boundary (set by the project owner).** UIFP is a reference for **structure and organisation only** — how a codebase is laid out, where tests live, how modules are kept from tangling, how environments get set up. **No UIFP implementation logic, code, error scheme, auth mechanism, data-access pattern, or domain concept is carried across.** Where a row below says a practice is worth having, it means _we will design our own version of that idea for ECMS_ — never that we lift theirs. The point of studying it is to **improve on it**, not to inherit it.

Verdicts: **LEARN FROM** (the structural idea is sound — we build our own) · **IMPROVE ON** (right instinct, their execution has gaps we fix) · **REJECT** (over-engineering, UIFP-specific, or actively weak).

| Area                      | UIFP practice                                                                                                                                                                                                                                                                                | Strength                                                                                                                                                             | Weakness / risk                                                                                                                                                                                                                                                                                           | Verdict                    | Recommendation for ECMS                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**          | Six Koa microservices, hexagonal per service, "no exceptions"                                                                                                                                                                                                                                | Clean boundaries; domain has zero infrastructure imports                                                                                                             | Full ports/adapters ceremony applied even to plain CRUD (the admin service is 6 handlers → 2 services → 2 ports → 2 adapters for simple CRUD)                                                                                                                                                             | **ADAPT**                  | Modular monolith. Rich domain modelling only where invariants are real (drawings, approvals, issues, access); `controller → service → repository` for reference-data CRUD                                         |
| **Module boundaries**     | Layered dependency DAG, written down **and** matching every `package.json`; core package has exactly one dependency                                                                                                                                                                          | The DAG is real, not aspirational — which is precisely what makes pure unit tests possible                                                                           | Acyclicity is convention-only — no `import-x/no-cycle`, no `no-restricted-imports`                                                                                                                                                                                                                        | **IMPROVE ON**             | Declare the module DAG and **machine-enforce it** in lint/CI from day one                                                                                                                                         |
| **Authentication**        | `jose` JWT, **algorithm pinned** to RS256, claims re-validated by hand after verify, library error text never reaches the wire                                                                                                                                                               | Algorithm pinning prevents `alg:none` / HS-RS confusion — non-negotiable                                                                                             | `issuer`/`audience` options are plumbed but **no service passes them**; any token signed by a key in the set is accepted                                                                                                                                                                                  | **IMPROVE ON**             | Pin algorithms, re-validate claims, **and** enforce `iss`/`aud`                                                                                                                                                   |
| **Authorization**         | 3-segment `action:resource:org` scope strings + provisioning-time taxonomy validation                                                                                                                                                                                                        | Fails closed on malformed input and on missing auth state                                                                                                            | Encoding the tenant into a scope string is complex; a `:all`-scoped principal satisfies the org segment for _every_ org                                                                                                                                                                                   | **ADAPT**                  | Simpler: named permission + **row-level project scope check**. Do not encode scope into strings                                                                                                                   |
| **Permissions**           | Handler **re-verifies** tenant on every write, independently of the scope check                                                                                                                                                                                                              | **The most important security idea in the repo.** One layer is provably insufficient                                                                                 | —                                                                                                                                                                                                                                                                                                         | **LEARN FROM**             | Every write handler re-checks the record's `projectId` against the principal's authorized set. Never trust the permission check alone                                                                             |
| **Validation**            | Zod schemas in a leaf package; types via `z.infer`; API schemas composed from domain schemas; `.strict()` rejects unknown keys; validator **replaces** the body with parse output; `.describe()` drives OpenAPI from the same object                                                         | One declaration yields validation + type + API docs, so they cannot drift. Normalization lives inside the schema and the whole stack sees normalized data            | Claim of "single source of truth" has holes: repository row schemas hand-copy domain enums with no test binding them; results are `as`-cast at the end, discarding the validation                                                                                                                         | **IMPROVE ON**             | Schema-first with derived types. Derive row schemas from domain schemas rather than restating them. Never `as`-cast away a validated result                                                                       |
| **API design**            | POST-for-everything RPC (including reads and deletes); only 200/400/500                                                                                                                                                                                                                      | v1 wire compatibility                                                                                                                                                | Actively harmful outside that constraint — breaks caching, retry middleware, load-balancer metrics, and every observability dashboard                                                                                                                                                                     | **REJECT**                 | Proper REST semantics and real HTTP status codes (401/403/404/409/422/429)                                                                                                                                        |
| **Error handling**        | `uifpError(code, args)` **mandatory factory** — call sites choose a code, never free-type a message; registries as `as const` with derived unions so a typo is a compile error; one `buildErrorResponse` shared by handler and logger; framework 4xx throws coerced into typed client errors | Excellent. Messages cannot drift, envelope cannot diverge, malformed JSON doesn't pollute the 5xx error rate                                                         | Two-tier umbrella+detail codes exist only because there are three HTTP statuses; HTTP status resolved by **string prefix matching** (`errorCode.startsWith('UIFP05')`)                                                                                                                                    | **ADAPT**                  | Keep the factory, the `as const` registries, and the shared envelope builder. Collapse to **one** stable code + proper HTTP status + `fields[]`. Put status in the registry as data                               |
| **Logging**               | Dual `txn`/`detail` channels, buffered-replay ring buffer, runtime-tunable levels; ALS mixin stamping correlation IDs on every line; masking applied at push time (verified)                                                                                                                 | The ALS mixin (~40 LOC) and "never re-log a mixin field" are outstanding value. `withStoredRequestContext` solves a real, non-obvious problem                        | ~600 LOC solving "production runs silent but I need the trace on failure" — a problem we don't have. **Deny-list masking of 5 exact-case fields** misses `Password`, `token`, `email`, `ssn`, `bankAccount`. **All request headers logged** on the detail channel — cookies hit disk precisely on failure | **Split verdict**          | **LEARN FROM:** the correlation-ID-on-every-line idea, mask-at-push principle, `snake_case` log fields, echo request ID to caller. **REJECT:** dual channels, replay buffer, deny-list masking, header dumping    |
| **Audit trails**          | `transaction_log` row written **in the same transaction** as the business write, keyed by the request ID, and written on business-rule **rejection** too                                                                                                                                     | Arguably the highest-value data pattern for our domain. A support ticket quoting the request ID joins logs and audit rows in one step                                | —                                                                                                                                                                                                                                                                                                         | **LEARN FROM**             | The _idea_ is what transfers: audit written inside the same transaction, keyed to a correlation ID, recording rejections too. We design our own audit schema and writer for ECMS                                  |
| **Database access**       | Repositories as **free functions** whose first parameter _type_ declares the transaction requirement (`CommonQueryMethods` for reads vs `DatabaseTransactionConnection` for writes)                                                                                                          | **The single best DB pattern in the repo.** You structurally cannot pass a pool where a transaction is required. Costs nothing                                       | Writes bypass result-schema validation by convention                                                                                                                                                                                                                                                      | **LEARN FROM**             | Encode the transaction requirement in the type signature                                                                                                                                                          |
| **Transactions**          | Advisory lock acquired **first, inside** the transaction; bounded retry loop **outside** it; typed narrow error classes so the retry branch can't swallow unrelated violations                                                                                                               | Textbook optimistic concurrency. The lock key choice is documented along with what would break under the alternative                                                 | —                                                                                                                                                                                                                                                                                                         | **LEARN FROM**             | Directly applicable to concurrent editing and revision creation                                                                                                                                                   |
| **Migrations**            | node-pg-migrate; named constraints; `updated_at` trigger; a **business-rule-enforcing trigger**; least-privilege role grants                                                                                                                                                                 | Enforcing a critical invariant _in the database_ is exactly right, and is our model for drawing immutability                                                         | One 447-line migration, **no `down()`**, environment-specific GRANTs baked into schema DDL                                                                                                                                                                                                                | **ADAPT**                  | Small reversible migrations, always with `down`. Keep grants in a separate bootstrap step. Keep the invariant-enforcing trigger idea                                                                              |
| **Soft delete**           | **Absent entirely** — all deletes are hard `DELETE`                                                                                                                                                                                                                                          | Defensible for an identity mapping table                                                                                                                             | Wrong for a business system with history requirements                                                                                                                                                                                                                                                     | **REJECT (their absence)** | PRD §12 mandates archival/soft deletion. Add `deleted_at` plus partial unique indexes                                                                                                                             |
| **File management**       | Not applicable — UIFP handles no files                                                                                                                                                                                                                                                       | —                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                         | **N/A**                    | No precedent available; the Google Drive design in §6.5 is original                                                                                                                                               |
| **Configuration**         | etcd runtime config with live watchers; tiny bootstrap env contract (4 non-secret vars), everything else fetched at startup                                                                                                                                                                  | The small bootstrap contract is elegant — adding a config value never touches deploy config                                                                          | ~569 LOC of distributed config machinery; three incompatible environment vocabularies across README, runtime parser and seeder                                                                                                                                                                            | **ADAPT**                  | Environment variables plus a database-backed settings table. **Define the environment enum once** and derive everything from it                                                                                   |
| **Secrets**               | HashiCorp Vault, per-environment namespacing via a shared path-builder used by both writer and reader; ADO variable groups in CI                                                                                                                                                             | The shared path-builder guarantees writes and reads agree — a genuinely good technique                                                                               | A **live registry credential sits in `.npmrc` in the working tree** on the deploy VM (gitignored and untracked, but the pipeline doc calls it "committed")                                                                                                                                                | **ADAPT**                  | Use the hosting platform's secret store. Keep the shared path-builder idea. See §5 finding S-0                                                                                                                    |
| **Testing**               | Three tiers separated by non-overlapping globs; in-memory port stubs for pure domain tests; **mock the edges, run the real core**; Testcontainers running the **real migrations** and seeding through the **real repositories**; **middleware order pinned by side-effect tests**            | Very strong. Running real migrations in tests means a migration bug fails the suite. Side-effect ordering tests prove behaviour rather than structure                | **35 integration + 4 E2E tests never run in CI** — only unit tests gate merges. Tests are unlinted (`eslint src/` only)                                                                                                                                                                                   | **IMPROVE ON**             | Same three-tier shape and the same discipline (real migrations in tests, mock only the edges) — written fresh for ECMS. Fix their gap: **run the integration tier in CI**                                         |
| **CI/CD**                 | install → build → lint → typecheck → test, with build first because workspace deps resolve through built declaration files                                                                                                                                                                   | Sensible ordering, and the reason is documented                                                                                                                      | `format:check` exists but is **not** in CI (formatting enforced by an editor hook, so it only covers AI-authored edits). Build/test run **on the production VM**. Migrations and seeding are **absent from the pipeline entirely**                                                                        | **ADAPT**                  | Same sequence plus `format:check` and integration tests. Build artifacts separately from the deploy target. Make `bootstrap <env>` an explicit idempotent pipeline stage                                          |
| **Monitoring**            | Pino structured logs, prom-client metrics with PM2 cluster aggregation, OpenTelemetry traces, `/isAlive` + `/metrics` health endpoints                                                                                                                                                       | Health endpoints excluded from auth in four places (belt-and-braces)                                                                                                 | Cluster metric aggregation over process IPC is scale machinery                                                                                                                                                                                                                                            | **ADAPT**                  | Structured logs with correlation IDs, health endpoint, error tracking. Defer metrics aggregation and tracing                                                                                                      |
| **Security (overall)**    | Constant-time credential verification with a pre-computed dummy hash; returning 400-not-500 on a post-auth misconfiguration to avoid a validity oracle; fail-closed permission matcher                                                                                                       | Careful, deliberate thinking — worth copying verbatim                                                                                                                | **No CORS, no security headers, no CSRF protection anywhere in the repository.** Defensible for machine-to-machine APIs behind a gateway; **not** defensible for ECMS, which has a browser front end                                                                                                      | **IMPROVE ON**             | Take the _principles_ — constant-time credential checks, fail-closed by default, no user-existence oracle — and implement them ourselves. Add the CORS allow-list, security headers and CSRF protection they lack |
| **Code quality**          | `strict: true` + `noUncheckedIndexedAccess`; **one** `eslint-disable` and **zero** `as any` / `@ts-ignore` in ~21k LOC; import ordering with a workspace path group                                                                                                                          | The zero-escape-hatch culture is the strongest signal in the audit — strict settings are worthless if the team routes around them                                    | Missing several useful strictness flags; ESLint is not type-aware                                                                                                                                                                                                                                         | **LEARN FROM**             | Match the strictness level and, more importantly, the zero-escape-hatch culture. Add `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, `noImplicitOverride`, and type-aware linting                      |
| **AI-agent context file** | `_bmad-output/project-context.md` — 244 lines of rules that are _unobvious_, negatively framed (`MUST NOT`), each carrying a **why** and often an incident ID, with a "deliberate exceptions — do not 'fix' these" section, **cited from code comments by line number**                      | Excellent concept. The "deliberate exceptions" section stops every agent session re-litigating settled decisions. Code pointing _at_ the file is what keeps it alive | Has drifted from the code in at least three documented places; some 800-character table cells are unreviewable in a diff                                                                                                                                                                                  | **ADAPT**                  | Build one on day one (~150 lines). PRD §16 is already a seed. Include a "deliberate exceptions" section. Review it whenever a PR violates a rule                                                                  |

### 4.1 The meta-practice worth carrying above all others

Nearly every non-obvious line in the reference codebase carries a comment explaining **why it isn't the obvious thing** — frequently naming the incident that caused it. Not _what_ the code does; _why the naive version is wrong_. That habit costs nothing but discipline and is the single most transferable thing in the repository.

---

## 5. Security Gap Analysis

Framed against OWASP ASVS themes. **No compliance claim is made** — nothing here has been verified by testing; these are design-stage risks and proposed controls for a system that does not yet exist.

### 5.1 Finding in the reference repository (for your awareness, not ECMS)

| ID      | Finding                                                                                               | Detail                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-0** | A live artifact-registry credential sits in `.npmrc` in the UIFP working tree on a shared deploy path | It is correctly `.gitignore`d and confirmed **untracked**, so it is not in git history. However `azure-pipelines.yml` refers to it as "the committed .npmrc", which is a documentation-vs-reality mismatch worth correcting. **Recommendation: rotate the credential and move it to a CI secret.** Raised only because it surfaced during analysis — it is not an ECMS issue |

### 5.2 ECMS risk register

| Risk                                                                                                      | Exposure in the proposed design                                                                                     | Impact                                                                                 | Likelihood                                        | Priority | Recommended control                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Broken object-level authorization** (a user reads/edits a record in a project they are not a member of) | High if authorization is checked only at the route/role layer                                                       | **Critical** — cross-client confidentiality breach                                     | High — this is the most commonly shipped API flaw | **P0**   | Project-scoped `authorize(actor, action, resource)` at the application layer **plus** repository-level project scoping, so a forgotten check returns nothing rather than everything. Directly mirrors the reference repo's hard-won "one layer is insufficient" lesson                                                                     |
| **Cross-project data leakage** via list/search/report endpoints                                           | High — aggregate endpoints are the classic place scoping is forgotten                                               | **Critical**                                                                           | Medium-High                                       | **P0**   | The reporting module filters to the actor's authorized project set at the query layer. Integration tests assert a non-member receives an empty result, not a filtered-in-UI result                                                                                                                                                         |
| **Unauthorized document access through Google Drive directly**                                            | **Critical if end users hold Drive permissions** — application RBAC becomes decorative                              | **Critical**                                                                           | High if per-user Drive ACLs are chosen            | **P0**   | Service-account-owned folder tree; **users get no direct Drive access**; all file access brokered and authorized by the application (§6.5). One ACL system, one enforcement point                                                                                                                                                          |
| **Drawing revision tampering** (overwriting approved history)                                             | Explicitly prohibited by PRD §6/§12/§16                                                                             | **Critical** — legal/contractual exposure in engineering consultancy                   | Medium — an ORM `update()` is one line away       | **P0**   | Append-only revision table; database **trigger** rejecting UPDATE/DELETE on approved revisions; partial unique index for the single current revision. Enforced in the database so a bug or direct DB access cannot bypass it                                                                                                               |
| **Audit log tampering**                                                                                   | PRD §10 requires non-editability                                                                                    | **Critical** — destroys traceability, the system's core value                          | Low-Medium                                        | **P0**   | Append-only table; **application DB role granted INSERT + SELECT only**, no UPDATE/DELETE; migrations run under a separate role. Audit written in the same transaction as the change                                                                                                                                                       |
| **Approval manipulation** (approving without authority, or self-approval)                                 | Medium                                                                                                              | **High** — financial and contractual consequence                                       | Medium                                            | **P0**   | Approve is a distinct permission (PRD §8) checked against the _target's_ project. Record approver identity, timestamp and comments immutably. Separation-of-duties rule (may an author approve their own submission?) is an open business question — see §9B                                                                               |
| **Double approval / race on state transition**                                                            | Two approvers acting simultaneously                                                                                 | High — conflicting decisions, corrupted workflow state                                 | Medium                                            | **P1**   | Conditional state transition inside a transaction (`WHERE status = 'Submitted'`); the second attempt matches zero rows and is rejected. No locking, no contention                                                                                                                                                                          |
| **Privilege escalation** via role/permission administration                                               | Medium                                                                                                              | **Critical**                                                                           | Low-Medium                                        | **P1**   | Admin permission required for all role changes; every grant/revoke audited; no self-elevation path; changes take effect on next authorization check, not from a cached claim                                                                                                                                                               |
| **Concurrent update / lost update** on issues, observations, projects                                     | High — normal multi-user operation                                                                                  | Medium — silent data loss, erodes trust                                                | High                                              | **P1**   | Optimistic locking via `version` column surfaced as an ETag; conflicting writes rejected with a clear conflict the UI can present                                                                                                                                                                                                          |
| **Unsafe workflow transitions** (skipping states, illegal jumps)                                          | Medium                                                                                                              | High — corrupt business records                                                        | Medium                                            | **P1**   | State machines defined explicitly in the domain layer; transitions validated server-side (PRD §12); illegal transitions rejected and audited                                                                                                                                                                                               |
| **Google Drive integration failure / file-metadata mismatch**                                             | High — dual write across two systems of record                                                                      | High — orphan metadata, orphan files, broken document links                            | **High** — network failures are routine           | **P1**   | Pending→active state machine, idempotency keys on upload, and a **reconciliation job** detecting metadata without files and files without metadata (PRD §7 requires failure logging and safe retries)                                                                                                                                      |
| **Duplicate background processing**                                                                       | Medium                                                                                                              | Medium — duplicate notifications, double-counted records                               | Medium                                            | **P1**   | Single scheduled worker guarded by a database advisory lock; unique constraint on `(job_type, target, period)`. No broker needed at this scale                                                                                                                                                                                             |
| **Duplicate submission** (double-click, client retry)                                                     | High                                                                                                                | Medium — duplicate records                                                             | High                                              | **P1**   | Client-supplied idempotency key, unique-constrained; a repeat returns the original result                                                                                                                                                                                                                                                  |
| **Accidental data deletion**                                                                              | Medium                                                                                                              | **High** — PRD §6 forbids destructive deletion where dependent history exists          | Medium                                            | **P1**   | Soft delete/archival only for business records; referential constraints; explicit dependency checks before archival; hard delete reserved for administrative correction with audit                                                                                                                                                         |
| **Missing CORS / security headers / CSRF protection**                                                     | **Certain if we copy the reference repo**, which has none of the three                                              | High — session riding, clickjacking, cross-origin data access from a browser client    | High                                              | **P0**   | Explicit CORS origin allow-list (never `*` with credentials), security headers (HSTS, frame-ancestors, content-type options, a CSP), and CSRF protection appropriate to the chosen session mechanism                                                                                                                                       |
| **Sensitive data exposure in logs**                                                                       | **High if the reference repo's masking is copied** — a 5-item exact-case deny-list, plus all request headers logged | High — client PII, contacts and commercial terms written to disk, precisely on failure | High                                              | **P0**   | Allow-list what may be logged rather than deny-listing what may not; never log full headers; redact at serialization time                                                                                                                                                                                                                  |
| **Sensitive error exposure**                                                                              | Low — the reference pattern is sound                                                                                | Medium — internal detail aids an attacker                                              | Low                                               | **P2**   | Principle only: any unrecognised throw collapses to a generic response; stack traces go to logs, never to the client. Our own error layer, designed for ECMS                                                                                                                                                                               |
| **API abuse / brute force**                                                                               | Medium — PRD §14 requires rate limiting                                                                             | Medium                                                                                 | Medium                                            | **P1**   | Rate limiting on authentication endpoints and expensive queries. Note the reference repo rate-limits _after_ authentication (correct — limit the authenticated principal, not a spoofable request) but that leaves an unauthenticated flood costing a full signature verification each. **Add a cheap IP-based limiter outermost as well** |
| **Weak authentication**                                                                                   | Depends on the (open) identity decision                                                                             | **Critical**                                                                           | Medium                                            | **P0**   | Pin JWT algorithms; enforce `iss`/`aud` (the reference repo plumbs these but never sets them); constant-time credential comparison with a pre-computed dummy hash; no user-existence oracle in error responses                                                                                                                             |
| **Data corruption from partial writes**                                                                   | Medium                                                                                                              | High                                                                                   | Medium                                            | **P1**   | One use case = one transaction, including its audit write (PRD §12)                                                                                                                                                                                                                                                                        |
| **Backup/recovery failure discovered during an incident**                                                 | Medium — untested backups are the norm                                                                              | **Critical** — total data loss                                                         | Medium                                            | **P0**   | PRD §13 already mandates **restore testing in a non-production environment**. Treat an untested backup as no backup. RPO/RTO targets are an open business question                                                                                                                                                                         |

### 5.3 Highest-priority security themes

Three things carry disproportionate risk and should be settled before implementation begins:

1. **Project-scoped authorization enforced in two independent layers.** Everything else in this system is downstream of getting this right.
2. **The Google Drive permission model.** If end users hold direct Drive access, application-level document security is decorative regardless of how well it is implemented.
3. **Database-enforced immutability** for drawing revisions and the audit trail. These two invariants are too important to leave to application code alone.

---

## 6. Proposed Architecture Options

### 6.1 Topology — the decisive choice

Three options were considered against the confirmed constraint of **under 50 users** and the PRD's own principle to "avoid unnecessary complexity until business needs require it" (§22).

| Option                                  | Description                                                                                                                                           | Verdict                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Modular monolith** ✅              | One deployable backend organised into strictly-bounded modules, one database, one frontend. Module boundaries enforced in code, not by network calls. | **Recommended**                                                                                                                                                                                                               |
| B. Service-per-domain                   | Separate deployables for planning, supervision, documents, etc. Mirrors UIFP.                                                                         | Rejected — introduces distributed transactions, network failure modes, and operational cost with zero benefit at this scale. The PRD's integrity requirements (transactions across records, §12) become _harder_, not easier. |
| C. Monolith with no internal boundaries | Conventional layered CRUD app, modules by technical layer only.                                                                                       | Rejected — this system has genuinely distinct invariants (drawing immutability, approval authority, audit integrity). Without boundaries those rules leak everywhere and erode.                                               |

**Why A:** it satisfies "support future growth without redesigning the core architecture" (§2) by making boundaries explicit _in the code_ now. If a module ever genuinely needs to be extracted, the seam already exists. This buys the optionality of B without paying its cost today.

**Trade-off:** a monolith scales as one unit and a bad deployment affects everything. At <50 users this is acceptable and is offset by the release process the PRD already mandates (§15).

**Risk:** module boundaries decay without enforcement. Mitigation: an automated dependency-boundary rule in lint/CI, so a forbidden cross-module import fails the build rather than relying on discipline.

### 6.2 System context

**Actors:** System Administrator · Management/Director · Project Manager · Planning Team · Supervision Team · Document Controller · _(future: Client/External Stakeholder)_.

**External systems:** Google Shared Drive (engineering files) · identity provider _(if SSO is chosen — open)_ · SMTP/email _(only if notifications expand beyond in-app — open)_ · backup/PITR facility _(provider-dependent — open)_.

**Trust boundaries:**

1. Browser ↔ application API — **untrusted**. All authorization decided server-side (§8, §14, §16). The frontend may hide UI, but never enforces.
2. Application ↔ PostgreSQL — restricted network path, least-privilege application role (§14 "restricted database access").
3. Application ↔ Google Drive — the application holds the credential; **end users never hold Drive access directly** (§14 "no privileged third-party credentials exposed in frontend code"). See §6.5.
4. _(Reserved)_ Internal users ↔ external stakeholders — the boundary is designed for now, populated later.

### 6.3 Logical layering

The PRD's suggested layering fits and is adopted, with one important qualification:

```
Interface        HTTP controllers, request/response contracts, auth extraction
      ↓
Application      Use cases; one use case = one transaction = one audit write
      ↓
Domain           Business rules, state machines, invariants (no framework imports)
      ↓
Infrastructure   Persistence, Google Drive adapter, notification delivery, clock
```

**Qualification — depth proportional to risk.** Applying full ports-and-adapters ceremony to every module would be over-engineering for a 50-user system. Recommended split:

- **Rich domain modelling** for modules with real invariants: Drawings/Revisions, Approvals, Issues, Handover, Access Control.
- **Thin application-service style** for reference-data CRUD: Clients, Properties, Contacts.

This is a deliberate deviation from UIFP's "hexagonal everywhere, no exceptions" rule, justified by scale.

### 6.4 Module boundaries and dependency rules

Proposed modules (all within one deployable):

| Module          | Responsibility                                                       | Owns                                      |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| `access`        | Authentication, roles, permissions, **project membership**           | User, Role, Permission, ProjectMembership |
| `directory`     | Client and property reference data                                   | Client, Property, Contact                 |
| `projects`      | Project lifecycle and workstreams; the authorization anchor          | Project, Workstream, Assignment           |
| `planning`      | Planning activities, milestones, submissions, authority applications | PlanningActivity, Submission, Milestone   |
| `supervision`   | Site visits, observations, instructions                              | SiteVisit, Observation, Instruction       |
| `issues`        | Issue tracking, assignment, severity, closure                        | Issue                                     |
| `documents`     | Document register, metadata, polymorphic links, access history       | Document, DocumentLink, AccessLog         |
| `drawings`      | Drawing register and **immutable revision control**                  | Drawing, DrawingRevision                  |
| `approvals`     | One reusable approval state machine over many target types           | ApprovalRequest, ApprovalDecision         |
| `handover`      | Handover checklists, outstanding items, closure                      | HandoverChecklist, OutstandingItem        |
| `notifications` | In-app notification generation and read state                        | Notification                              |
| `audit`         | Append-only audit trail                                              | AuditEntry                                |
| `reporting`     | Dashboard and management read models (query-only)                    | _(none — reads across modules)_           |

**Dependency rules (to be lint-enforced):**

- `access`, `audit` are leaf/foundational — they depend on nothing above them.
- No module imports another module's persistence layer or internal entities; interaction is via that module's published interface only.
- `reporting` is read-only and may query broadly, but may never mutate.
- Cross-module reactions (e.g. "issue assigned → notify") go through **domain events**, not direct calls, so `issues` never depends on `notifications`.
- No cyclic dependencies, enforced in CI.

**Key consolidation decisions, with rationale:**

- `Client` and `Property` merged into `directory` — they always change together and share no independent invariants; separating them adds ceremony without benefit.
- `Drawings` kept **separate** from `Documents` despite both being files, because drawing revisions carry the strictest immutability rule in the PRD (§6, §12, §16) and that invariant should not be diluted by general document handling.
- `Approvals` is a **single shared module**, not per-workflow duplication — the PRD defines exactly one approval state machine (§6) used across planning submissions, drawings and documents. One implementation means one place to enforce approval permission and one audit path.

### 6.5 Google Drive integration — the highest-risk boundary

This is a **dual-write across two systems of record** and deserves explicit design.

**Recommended model — application-mediated, service-account owned:**

- A **service account** owns the entire project folder tree in the Shared Drive. End users are granted **no direct Drive permissions at all**.
- All file access is brokered by the application, which authorizes against project scope first, then streams the file or issues a short-lived, single-use link.
- The application database remains authoritative for metadata and for _who may see what_.

**Why:** the alternative — per-user OAuth with Drive-side ACLs mirroring application RBAC — creates two permission systems that must be kept in sync forever. Any divergence is silent unauthorized document access, and it defeats the PRD's requirement that access be enforced by the backend (§8). One ACL system, one enforcement point.

**Trade-off:** the application becomes the bandwidth path for downloads. At this scale that is a non-issue, and it is what makes the document access log (§6) truthful rather than advisory.

**Write flow (avoids both orphan classes):**

1. Create metadata row in `pending` state, in a transaction, with an idempotency key.
2. Upload bytes to Drive; capture the Drive file ID.
3. Mark the row `active` with the file ID.

- Failure between 1 and 3 leaves a `pending` row that a **reconciliation job** retries or reaps. Failure after 2 but before 3 is recoverable because the idempotency key prevents a duplicate upload on retry.
- A periodic reconciliation also detects files present in Drive with no metadata, and metadata whose Drive file has been moved or deleted out-of-band.

**Explicitly unresolved and needed from the business:** the Drive authentication model, folder naming conventions, and whether anyone outside the application is permitted to touch the Drive tree directly. If people _do_ edit the Drive directly, the reconciliation job moves from a safety net to a core feature.

---

## 7. Domain Design Detail

### 7.1 Authorization model — the most consequential decision

**Recommendation: project-scoped authorization, deny by default.**

The PRD defines a flat role→verb matrix (§8) but simultaneously requires "View **authorized** projects" — a flat matrix cannot express that. The model must be:

> **effective permission = global role grants ∪ (role within this specific project)**

- Every business record must resolve to an owning `projectId` (directly, or via a short, well-defined path).
- Authorization is evaluated as `(actor, action, resourceType, projectId)`.
- Global roles (System Administrator, Management/Director) carry portfolio-wide grants; operational roles are granted **per project** via membership.
- Default is **deny**. Absence of a grant is never permission.

**Defense in depth — one layer is not enough.** A single forgotten check is exactly how object-level authorization breaks. Two independent mechanisms:

1. An explicit `authorize(...)` call in the application layer for every use case.
2. Repository-level project scoping, so a query that forgets its filter returns nothing rather than everything.

This is a lesson observable in the reference repo — permission checking alone proved insufficient for tenant isolation, and a second independent check was needed. We take the _lesson_, not their mechanism: ECMS gets its own authorization design.

### 7.2 Per-domain summary

For each module: responsibility, ownership, events produced/consumed, authorization basis.

| Module          | Events produced                                             | Events consumed                                           | Authorization basis                                                    |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `access`        | `UserCreated`, `RoleChanged`, `MembershipGranted/Revoked`   | —                                                         | Admin permission only                                                  |
| `directory`     | `ClientArchived`, `PropertyLinked`                          | —                                                         | Global role; archival blocked where project history depends on it (§6) |
| `projects`      | `ProjectCreated`, `ProjectStatusChanged`, `ProjectArchived` | `MembershipGranted`                                       | Project scope; creation is a global permission                         |
| `planning`      | `SubmissionCreated`, `MilestoneDue`                         | `ApprovalDecided`                                         | Project scope + Planning role                                          |
| `supervision`   | `SiteVisitRecorded`, `ObservationRaised`                    | —                                                         | Project scope + Supervision role                                       |
| `issues`        | `IssueOpened/Assigned/Resolved/Closed`                      | `ObservationRaised`                                       | Project scope; **Close** is a distinct permission (§8)                 |
| `documents`     | `DocumentRegistered`, `DocumentAccessed`                    | `ApprovalDecided`                                         | Project scope + document-level status                                  |
| `drawings`      | `RevisionCreated`, `RevisionSuperseded`                     | `ApprovalDecided`                                         | Project scope + Document Controller / Planning                         |
| `approvals`     | `ApprovalRequested`, `ApprovalDecided`                      | —                                                         | **Approve** permission, checked against the target's project           |
| `handover`      | `HandoverStarted`, `ProjectClosed`                          | `IssueClosed`                                             | Project scope + Close permission                                       |
| `notifications` | —                                                           | assignment, approval, due-date, status-change events (§9) | Recipient-scoped                                                       |
| `audit`         | —                                                           | **all** state-changing events                             | Append-only; readable per role, writable by no user                    |
| `reporting`     | —                                                           | —                                                         | Filtered to the actor's authorized project set                         |

### 7.3 Drawing revision integrity

The PRD's strictest rule (§6, §12, §16: never overwrite approved drawing history). Design:

- `drawing` — stable identity (number, title, project).
- `drawing_revision` — **append-only**. A new revision is a new row, never an update.
- Exactly one current revision per drawing, enforced by a **partial unique index**, not by application logic.
- Once a revision reaches `Approved`, it becomes immutable — enforced by a **database trigger** rejecting UPDATE/DELETE, so the rule holds even against a bug, a migration script, or direct database access.

The general principle — enforce the most critical invariant _in the database_, not only in application code — is sound and worth adopting. The specific trigger, table design and constraints are ours to design for ECMS.

### 7.4 Audit trail integrity

- Append-only table; no update or delete path exists in application code.
- The **application database role is granted INSERT and SELECT only** on the audit table — no UPDATE, no DELETE. Schema changes run under a separate migration role. This makes "audit history must not be editable by ordinary users" (§10) a database guarantee rather than a promise.
- The audit entry is written **in the same transaction** as the business change, so a change can never exist without its audit record, and an audit record can never be forged independently.

---

## 8. Concurrency and Data Integrity Design

The PRD does not address concurrency, but multiple users editing the same project is the normal case. Each high-risk operation gets an explicit mechanism.

| Operation                                | Risk                                                                | Mechanism                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editing an issue / observation / project | Lost update from simultaneous edits                                 | **Optimistic locking** — `version` column, surfaced as an ETag; mismatched `If-Match` is rejected with a conflict the UI can present                                                                    |
| Approving a request                      | **Double approval** by two approvers at once                        | Conditional state transition inside a transaction (`UPDATE ... WHERE status = 'Submitted'`). The second approval matches zero rows and is rejected. Preferred over locking — no contention, no deadlock |
| Creating a record via POST               | Duplicate submission (double-click, retry)                          | Client-supplied **idempotency key**, unique-constrained; a repeat returns the original result                                                                                                           |
| Creating a drawing revision              | Two revisions claiming the same label or both marked current        | Unique constraint on `(drawing_id, revision_label)` + partial unique index on the current flag                                                                                                          |
| Document upload                          | Orphan metadata or orphan Drive file                                | Pending → active state machine plus reconciliation job (§6.5)                                                                                                                                           |
| Scheduled/background jobs                | **Duplicate processing** if a job overlaps or runs on two instances | Single scheduled worker guarded by a **database advisory lock**, plus a unique constraint on `(job_type, target, period)`. No message broker is warranted at this scale                                 |
| Any multi-record business operation      | Partial write                                                       | **One use case = one transaction**, including its audit write (§12 explicitly requires transactions for critical multi-record operations)                                                               |
| Archiving a client/property              | Orphaned project history                                            | Referential constraints plus an explicit dependency check; destructive delete is prohibited where history exists (§6) — archival only                                                                   |

**Retry safety principle:** every externally-triggered operation is either naturally idempotent or protected by an idempotency key. This matters most for the Drive integration, where §7 explicitly requires "safe retries".

---

## 9. Architecture Decisions Requiring Discussion

### A. Strongly recommended — I need agreement, not input

These follow from the PRD and the confirmed constraints. Each states why, what else was considered, and the trade-off.

| #   | Decision                                                                                                                   | Why                                                                                                                                                                                 | Alternatives considered                                                                                                                                                    | Trade-off / risk                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A1  | **Modular monolith**, boundaries enforced by lint/CI                                                                       | Under 50 users. PRD §22 explicitly says avoid complexity until needed. Boundaries in code preserve the option to split later                                                        | Microservices (rejected — distributed transactions make PRD §12's integrity requirements _harder_); unstructured layered CRUD (rejected — the real invariants would erode) | Scales and fails as one unit. Acceptable at this scale                                                                   |
| A2  | **Project-scoped authorization, deny by default, enforced in two independent layers**                                      | PRD §8 requires backend enforcement and "authorized projects"; a flat role matrix cannot express that. Broken object-level authorization is the highest-impact risk in the register | Role-only global RBAC (rejected — cannot express project scope); ACL-per-record (rejected — unnecessary complexity at this scale)                                          | Every query must carry project scope. Slight overhead on every read; this is the point                                   |
| A3  | **Drawing revisions append-only, immutability enforced by a database trigger**                                             | PRD §6/§12/§16 prohibit overwriting approved history. Too important to leave to application code                                                                                    | Application-layer checks only (rejected — one ORM `update()` bypasses it); event sourcing (rejected — disproportionate)                                                    | A trigger is invisible to developers reading only application code. Mitigate by documenting it in the project rules file |
| A4  | **Audit written in the same transaction, append-only, enforced by database privilege** (app role has INSERT+SELECT only)   | PRD §10 requires non-editability. A database privilege makes it a guarantee rather than a promise                                                                                   | Application-enforced only (rejected — a bug or direct DB access defeats it); external log shipping (rejected — adds infrastructure, loses transactional consistency)       | Requires a two-role database setup from day one                                                                          |
| A5  | **Application-mediated Google Drive access; service account owns the tree; users get no direct Drive permissions**         | Two ACL systems that must stay in sync is a permanent source of silent unauthorized access, and defeats PRD §8                                                                      | Per-user OAuth with mirrored Drive ACLs (rejected — see above); public folder links (rejected outright)                                                                    | The application becomes the download path. A non-issue at this scale, and it makes the access log truthful               |
| A6  | **Single reusable Approvals module**, not per-workflow duplication                                                         | PRD §6 defines exactly one approval state machine used across planning submissions, drawings and documents. One implementation = one permission check, one audit path               | Approval logic embedded per module (rejected — three divergent copies of a compliance-critical rule)                                                                       | Needs a polymorphic target reference; slightly more abstract                                                             |
| A7  | **Optimistic locking as the default** for multi-user record editing; conditional state transitions for approvals           | Concurrency is entirely unaddressed in the PRD but is the normal case. Conditional transitions beat locking — no contention, no deadlock                                            | Pessimistic locking (rejected — poor UX, deadlock risk); last-write-wins (rejected — silent data loss)                                                                     | The UI must handle a conflict response gracefully. Worth designing early                                                 |
| A8  | **Soft delete / archival for business records**; hard delete reserved for administrative correction                        | PRD §12 mandates archival; §6 prohibits destructive deletion where history exists. The reference repo's _absence_ of soft delete is the wrong model here                            | Hard delete with audit reconstruction (rejected — cannot restore relationships)                                                                                            | Every query must exclude archived rows; partial unique indexes required                                                  |
| A9  | **CORS allow-list, security headers, and CSRF protection from day one**                                                    | The reference repo has none of these — defensible for machine-to-machine, indefensible for our browser client                                                                       | Adding later (rejected — retrofitting CSRF after session design is painful)                                                                                                | Small upfront cost                                                                                                       |
| A10 | **Schema-first contracts with derived types; one error registry; correlation ID on every log line and audit row**          | Cheap to do, high payoff. A correlation ID joining logs to audit rows is directly valuable for support                                                                              | Hand-written types and ad-hoc errors (rejected — drift is guaranteed)                                                                                                      | Requires discipline about not casting validation away                                                                    |
| A11 | **Environment bootstrap as an idempotent, protected-by-default scripted stage** run in CI, with `--dry-run` and `--diff`   | The strongest structural idea worth learning from. Their own failure — bootstrap left as a manual step outside the pipeline — is the instructive part                               | Manual runbooks (rejected — that is exactly what rotted in the reference repo)                                                                                             | Some upfront tooling investment                                                                                          |
| A12 | **A project rules file for AI agents from day one**, including a "deliberate exceptions" section, cited from code comments | PRD §16 is already a seed of this. The reference repo demonstrates both the value and the failure mode (drift)                                                                      | No such file (rejected — every session re-litigates settled decisions)                                                                                                     | Must be reviewed whenever a PR violates a rule, or it drifts                                                             |

### B. Requires business input — I should not decide these

These map largely onto the PRD's own gap register (§17). Each genuinely changes the design.

| #   | Question                                                                                                                                  | Why it matters architecturally                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **Project lifecycle states and legal transitions**                                                                                        | The state machine is core domain logic. PRD §12 requires transitions be validated; I cannot validate against an unknown set     |
| B2  | **Role × module capability matrix** — who may view, edit, approve and close in each module                                                | Determines the permission catalogue. The seven roles and six verbs are known; the mapping is not                                |
| B3  | **Approval rules** — single vs multi-step, delegation, rejection/resubmission, and **whether an author may approve their own submission** | Multi-step changes the data model materially. Self-approval is a separation-of-duties control                                   |
| B4  | **Drawing naming convention and revision numbering**                                                                                      | Determines uniqueness constraints and whether revision ordering is derivable                                                    |
| B5  | **Issue severity definitions, SLA/due-date rules, closure evidence requirements**                                                         | Drives overdue calculation, notification triggers, and closure validation                                                       |
| B6  | **Document categories, required metadata, and Shared Drive folder conventions**                                                           | PRD §7 requires "predictable folder conventions" but does not define them                                                       |
| B7  | **Google Drive authentication model**, and **whether anyone may edit the Drive tree directly**                                            | If out-of-band Drive edits are permitted, reconciliation moves from a safety net to a core feature                              |
| B8  | **Notification routing** — which events notify whom; in-app only, or email too?                                                           | PRD §9 mentions in-app only. Email adds a delivery integration and a failure mode                                               |
| B9  | **Required management reports and KPIs**                                                                                                  | Determines whether a separate read model is justified or plain queries suffice                                                  |
| B10 | **Retention policy** for closed projects and records                                                                                      | Affects archival design and backup retention                                                                                    |
| B11 | **RPO/RTO targets**                                                                                                                       | PRD §13 mandates backups and restore testing but sets no targets. These drive the hosting decision                              |
| B12 | **Hosting/deployment target** _(currently undecided)_                                                                                     | Drives background jobs, secret storage, backup/PITR, and TLS. I will keep this deferrable, but it cannot stay open indefinitely |

### C. Can be safely postponed

| #   | Decision                                     | Why it can wait                                                                                                         |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| C1  | External client portal                       | Confirmed out of scope. The trust boundary and authorization model are being designed to accommodate it additively      |
| C2  | Reporting read models / materialised views   | Start with direct queries. Introduce projections only if measurement shows a need                                       |
| C3  | Full-text search across documents and issues | PostgreSQL full-text search is adequate initially; a search engine is a later concern                                   |
| C4  | Metrics aggregation and distributed tracing  | Structured logs with correlation IDs plus a health endpoint suffice at this scale                                       |
| C5  | Message broker / async event bus             | In-process domain events plus a database-backed job table are sufficient. Revisit only with a genuine async requirement |
| C6  | Mobile-specific applications                 | PRD §19 asks for tablet/mobile-friendly key workflows, which responsive design covers                                   |
| C7  | SSO / external identity provider             | Only if the business requires it; local authentication is sufficient to start                                           |

### D. Risks requiring attention

| #   | Risk                                                           | Concern                                                                                                                         | Proposed mitigation                                                                                                                                |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Authorization is the whole ballgame**                        | Everything else is downstream. A single missed check is a cross-client breach                                                   | Two independent enforcement layers (A2); integration tests asserting a non-member gets an empty result; make it the first thing built and reviewed |
| D2  | **Google Drive is a dual-write across two systems of record**  | Orphan metadata, orphan files, and — worst — divergent permissions                                                              | Service-account model (A5), pending→active state machine, idempotency keys, reconciliation job. Confirm B7 before building                         |
| D3  | **Undefined workflow states block core domain work**           | B1, B2, B3 gate the modules that carry most of the business value                                                               | Sequence PRD §20 Phase 1 (foundation, auth, clients, properties, projects) first — it is largely unblocked — while these are confirmed             |
| D4  | **Module boundaries decay without enforcement**                | The reference repo kept its DAG honest by discipline alone and still drifted in documentation                                   | Machine-enforce with `no-cycle` and restricted-import rules in CI, not convention                                                                  |
| D5  | **Copying reference-repo logging wholesale would leak PII**    | Its masking is a 5-item exact-case deny-list and it logs all request headers. Our data includes client PII and commercial terms | Allow-list logging; never log full headers; redact at serialization                                                                                |
| D6  | **Over-engineering by pattern-matching on the reference repo** | It solves 500M-record problems. Roughly 40% of its machinery is scale baggage                                                   | The §4 matrix is the guard. When in doubt, PRD §22 governs: avoid complexity until the business needs it                                           |
| D7  | **Untested backups**                                           | The most common cause of catastrophic loss. PRD §13 already requires restore testing                                            | Make a restore test a scheduled, evidenced activity, not a checklist item. Blocked on B11                                                          |
| D8  | **Test coverage that does not gate merges**                    | The reference repo has 39 valuable integration/E2E tests that never run in CI                                                   | Run the integration tier in CI from the first sprint, before the suite grows large enough to be slow                                               |
| D9  | **Hosting undecided**                                          | Backup strategy, job scheduling and secret management all hang on it                                                            | Keep these behind boundaries; escalate B12 before Phase 3                                                                                          |

---

## 10. Outcome

This document was reviewed and approved. The following were settled at that review:

| Decision                 | Outcome                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topology                 | Modular monolith confirmed — scale is under 50 users                                                                                                                       |
| Technology stack         | PRD §11 confirmed: Next.js, NestJS, PostgreSQL, Prisma                                                                                                                     |
| Google Drive & documents | Deferred to Phase 3, out of Phase 1                                                                                                                                        |
| Project lifecycle states | `Draft → Active → On Hold → Completed → Closed`                                                                                                                            |
| Role/permission model    | Job title determines _what kind_ of work; project membership determines _where_. Stored as data, not code, so the client's final answer is an update rather than a rebuild |
| External client portal   | Out of scope now; trust boundary designed so it can be added later                                                                                                         |

**Still open and needed from the client** — the §9B list, most urgently:

1. Project stage names, to validate the five statuses above.
2. Whether a Project Manager may add members to their own project, or whether that goes through an administrator.
3. Whether anyone places files into the shared drive by hand, outside the system. _(Ask early even though it is a Phase 3 concern — a "yes" materially changes the integration design.)_

Implementation is tracked separately in **`phase-1-plan.md`**.

---

## 11. A note on how UIFP was used

Worth restating, because it is easy to misread a document that discusses another codebase at length.

UIFP was studied for **structure and organisation** — how a codebase is laid out, where tests sit, how modules are stopped from tangling, and its environment-setup concept. **No implementation logic, code, error scheme, authentication mechanism, data-access pattern, or domain concept has been carried across.**

Its architecture is built for 500M+ records across six services. Ours is a single application for fewer than 50 users. Roughly 40% of what UIFP does would be actively harmful here.

Several of its weaknesses were as instructive as its strengths — notably that its database migrations and environment setup were never automated in CI, and that its integration tests do not gate merges. Both are avoided by design here.
