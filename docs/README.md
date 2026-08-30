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

## Two rules that are enforced, not just documented

**Module boundaries.** A module is reached only through its `index.ts`. Deep imports and cross-module relative paths fail the build — not code review.

**Audit history is append-only.** The application's database account holds `INSERT` and `SELECT` on `audit_entry` and nothing else. It cannot alter or delete history even if the code tries (PRD §10).
