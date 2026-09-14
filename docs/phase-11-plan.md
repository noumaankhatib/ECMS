# Phase 11 — Dashboards, Notifications, Search & Export

> **Source:** `Engineering_Consultancy_Management_System_Specification.docx`'s own Phase 5 —
> role dashboards, in-app notifications, a global search box, and register export — see
> `docs/PROGRESS.md`'s roadmap note and `~/.claude/plans/swirling-singing-book.md` (the approved
> roadmap), which places this deliberately last: it only reads what Phases 1–10 already record.
>
> **Status:** Complete.
> **Prerequisite:** Phases 1–10 (done — see `docs/PROGRESS.md`).

---

## 1. What Phase 11 is, in one sentence

Four read-only surfaces over data every earlier phase already stores — a dashboard, a
notifications/alerts list, one global search box, and CSV export of each register — built by
querying the existing services, never by adding a new table.

## 2. Why this next, and why nothing here is stored

Every prior phase in this roadmap that could have kept a second, derived fact chose instead to
compute it at read time: `SupervisionAgreement.visitsUsed` (Phase 7), `RequiredDocument`
completeness (Phase 9), `HandoverChecklist`'s open-issue/missing-document counts (Phase 10). This
phase is the same choice made four more times, because it is the last thing to read, not a new
thing to record — there is no notification a background job needs to have fired earlier, because
this phase has nothing users act on that changes anything: alerts are recomputed at every request,
never written, never dismissed as a status, never delivered by push. That also means there is no
scheduler, no email/webhook integration, and no new Prisma model anywhere in this phase.

## 3. Data model

**None.** No migration in this phase. Everything below reads existing tables through the
services those tables' own phases already built.

## 4. Dashboard

`GET /dashboard` — one summary object, assembled from counts each already-existing service can
answer, each field populated only when the caller holds the relevant view permission (omitted,
not zeroed, otherwise — a zero would claim "none exist", an absent field says "not shown to you"):

- `projects`: counts by `status` (`DRAFT`/`ACTIVE`/`ON_HOLD`/`COMPLETED`/`CLOSED`), scoped by
  `visibleProjectIds(userId, 'project:view')` — the exact scoping `ProjectService.list` already
  applies, reused via `Prisma.groupBy` rather than re-deriving the filter a second way.
- `proposals`: counts by `status`, gated on `proposal:view` (proposals carry no project scope to
  filter by, per Phase 5's own design).
- `issues`: open (`OPEN`/`IN_PROGRESS`) vs. closed, and overdue (open with `dueDate` in the past),
  gated on `issue:view`, scoped the same way `project:view` scopes projects (an issue's own
  `projectId`).
- `supervisionAgreements`: active agreements (no `endDate`, or `endDate` in the future) nearing
  their visit quota — reuses `SupervisionAgreementService`'s own `visitsUsed` computation
  (Phase 7), gated on `supervision:view`.
- `handover`: `COMPLETED` projects not yet `CLOSED`, and how many are `ready` per
  `HandoverService.status()` (Phase 10), gated on `project:view`.

No new permission, and no single gating permission on the route itself — only authentication
(`AuthGuard`) stands between a request and this endpoint. Gating on one permission (e.g.
`project:view`) would 403 a caller who holds only, say, `client:view` out of the whole dashboard
instead of just omitting the projects section; each section decides for itself, inside
`DashboardService`, exactly as §4 describes.

## 5. Notifications (alerts)

`GET /notifications` — a flat, freshly computed list, each item `{ type, severity, message,
projectId?, link }`, drawn from exactly the fields Phase-by-phase comments already flagged as
"a notification, and notifications are Phase 11" (`schema.prisma`'s own comments on
`Issue.priority` and `Document`'s missing-category note):

- **Overdue milestone** — `Milestone.targetDate` in the past, `achievedDate` still null.
- **Overdue issue** — `Issue.dueDate` in the past, `status` not `CLOSED`.
- **Submission awaiting response** — `Submission.clarificationRequested` true, no
  `clarificationRespondedAt`.
- **Supervision quota approaching** — `visitsUsed / visitsAllowed >= 0.8` on an active monthly
  agreement (reuses Phase 7's own computation, the alert this phase's plan explicitly deferred).
- **Missing required document** — any project with a non-empty
  `DocumentService.completeness()` gap (Phase 9).
- **Handover incomplete** — any `COMPLETED` project whose `HandoverService.status().ready` is
  false (Phase 10).

Each category is gated on the same permission its own resource already requires to view
(`issue:view`, `planning:view` for submissions/milestones, `supervision:view`,
`document:view`, `project:view` for handover) and scoped by `visibleProjectIds` exactly as that
resource's own list endpoint already is — a person sees an alert only for a project whose
underlying record they could otherwise see directly. No new permission resource.

## 6. Global search

`GET /search?q=` — fans out to the **existing** `list({ search: q, page: 1, pageSize: 5 })` call
on each already-listable service (`ClientService`, `PropertyService`, `ProjectService`,
`ProposalService`), not a second search implementation: every one of those services already
matches `q` case-insensitively against name/reference/code (the shared `search` field every list
query already carries — `packages/contracts/src/index.ts`'s `listQuerySchema` and its per-resource
equivalents). A resource is skipped entirely, not merely filtered to nothing, when the caller
lacks `canAnywhere(userId, '<resource>:view')` — the same two-layer posture (guard, then query
scoping) every list route already has, since each underlying `list()` call still applies its own
`visibleProjectIds` scoping.

Response: `{ results: { type, id, label, sublabel, projectId? }[] }`, grouped by `type` on the web
side. Deliberately **not** a `RequiredDocument`/`SupervisionAgreement`/`Submission` search target —
none of those three carry a caller-facing free-text label distinct enough from their parent
project to be worth a second entry in the same list (the spec's own field list — "Client/Property/
Project/Planning No./Supervision No./Municipality No./Ministry ID/Contract No." — is covered by
Client, Property and Project's own `code`/`reference` fields plus `Submission.permitReference`,
folded into the Project entry as `sublabel` rather than a fifth resource type).

## 7. Export

One CSV endpoint per already-listable register, not a generic exporter: `GET /export/clients.csv`,
`/export/properties.csv`, `/export/projects.csv`, `/export/proposals.csv`, `/export/issues.csv`.
Each rides the exact permission its own list route already requires (`client:view`, `property:view`,
`project:view`, `proposal:view`, `issue:view` via `RequirePermissionAnywhere`) and calls that
resource's own `list()` with `pageSize` raised to the full, `visibleProjectIds`-scoped count — the
same rows the register's own list page can already show, serialized, not a parallel query. No new
dependency: CSV needs nothing beyond string-joining and quoting, so no `csv`/`exceljs`/`pdfkit`
package is added — Excel opens a `.csv` natively, and PDF is dropped from this phase's scope (the
spec names it, but the three real registers in hand are Excel-first; a print-formatted PDF export
is exactly the kind of speculative shape nothing in this codebase's history has built ahead of a
confirmed need, and CSV alone already satisfies "Excel/CSV" of the spec's "Excel/CSV/PDF").

## 8. Web

- **Dashboard becomes the signed-in landing page** (`/dashboard`, and `(app)/page.tsx` redirects
  there) — role-relevant counts as the same stat-card grid style already used on project/proposal
  detail pages.
- **Notifications**: a count badge in the sidebar footer, linking to `/notifications` — a flat list
  grouped by severity, each item linking to the project/record it concerns. No polling; recomputed
  on navigation, matching "nothing here is pushed" (§2).
- **Search**: a single text input in the sidebar, submitting to `/search?q=` — results grouped by
  type, each a link to the record's own detail page.
- **Export**: an "Export CSV" link on each of the five register list pages (Clients, Properties,
  Projects, Proposals, Issues — the last surfaced from the project page's issue list), pointing at
  the new endpoint; the browser handles the download, no client-side CSV generation.

## 9. Build order

| #   | Step                                                                                                                  | Done when                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 41  | **Dashboard + Notifications** — `InsightsModule`, `DashboardService`/`NotificationsService`, `GET /dashboard`, `GET /notifications` | Each count/alert is gated and scoped by the same permission and `visibleProjectIds` its source resource already uses        |
| 42  | **Search + Export** — `SearchService`/`ExportService`, `GET /search`, five `GET /export/*.csv` routes                | Search fans out only to resources the caller holds `:view` on; export CSV matches what that register's list page would show |
| 43  | **Web** — dashboard landing page, notifications badge/list, sidebar search box, per-register export links             | Tested through the browser: dashboard/notifications/search reflect permission scoping; export downloads a valid CSV        |

## 10. Definition of done

- No new Prisma model or migration exists for this phase.
- `GET /dashboard`, `GET /notifications` and `GET /search` each omit, rather than fake-populate,
  any section the caller lacks permission for.
- Every export CSV's row set exactly matches what that resource's own list endpoint returns for
  the same caller, with `pageSize` covering every visible row.
- A user who is a member of nothing, and holds no global grants, receives an all-but-empty
  dashboard, an empty notifications list and empty search results — never a 403, matching the
  existing list-route posture.
