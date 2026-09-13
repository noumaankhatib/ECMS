# Phase 5 — Proposal / Sketch Intake

> **Source:** `Engineering_Consultancy_Management_System_Specification.docx` §5 ("Proposal / Initial
> Design Module") and §2 (~25 inquiries/month), cross-checked against the real
> `2026 Sketch Register - NOuman.xlsx` — the live register staff run this exact workflow in today. See
> `docs/PROGRESS.md`'s roadmap note and `~/.claude/plans/swirling-singing-book.md` (the approved 8-phase
> roadmap) for how this fits after Phase 4.
>
> **Status:** Plan for review. Nothing built yet.
> **Prerequisite:** Phase 4 (done — see `docs/PROGRESS.md`, `docs/phase-4-plan.md`).

---

## 1. What Phase 5 is, in one sentence

Give the business a real record for an inquiry from first contact to either a lost/on-hold outcome or a
one-click conversion into a numbered Planning project — replacing the Excel sheet that runs this today.

## 2. Why this next

**It's the highest-volume workflow still entirely off-system.** Spec §2 states ~25 inquiries/month; the
real register (`2026 Sketch Register - NOuman.xlsx`) shows 17 sketch numbers (`26-SB-101`…`26-SB-117`)
logged in about two weeks of August 2026 alone — this is daily, not occasional, work.

**The roadmap's own convert step needs it.** Row 2 of `swirling-singing-book.md`'s end-to-end flow
("Convert to a real project") assumes a Proposal exists to convert _from_. Nothing upstream of a Planning
project exists in the system today — a project can only be created already fully formed.

**Phase 4 already built what this needs.** `SequenceService` (`apps/api/src/modules/sequence`) proved the
atomic-increment, per-type-formatter pattern under concurrency; this phase adds one more `SequenceType`
(`SKETCH`) rather than inventing new numbering machinery.

## 3. What the real register shows

Columns actually in use in `2026 Sketch Register - NOuman.xlsx`: `Sr. No.`, `Sketch ID`, `Name`,
`Mobile Number`, `Type of Sketch`, `Status`, `Date`/`Requirement Received`, `Date Due`, `Remarks`,
`Reference`.

| Column                                       | What it proves                                                                                                                                                            | Where it lands                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Sketch ID`                                  | `26-SB-101`…`26-SB-117` — a real, already-in-use annual-reset series, distinct from `Project.code`'s `YY.P.NNN`/`YY.S.NNN`                                                | New `SequenceType` `SKETCH`, formatter `YY-SB-NNN`                                                         |
| `Name`, `Mobile Number`                      | The inquiry's contact, before any formal `Client`/`Contact` record necessarily exists                                                                                     | `Proposal.contactName`, `Proposal.contactPhone` (free text, see §5)                                        |
| `Type of Sketch`                             | Real values: `Villa - GF Only`, `Villa - G+1`, `Villa - G+1+PH`, `Farm Houses`, `Extensions`, `Industrial`, `Twin Villa`, `Res/Comm`, `Plot Division`, `Krookie Division` | `Proposal.sketchTypeId` — FK to a new admin-managed `ProposalSketchType` list, not free text (decided §5c) |
| `Status`                                     | Sample values look like customer provenance (`Old Customer`, `New Customer`), not a lifecycle stage — **does not map directly to spec §5's status list**                  | `Proposal.source` — kept separate from `Proposal.status` (decided §5b)                                     |
| `Date` / `Requirement Received` / `Date Due` | Inquiry date and a follow-up due date                                                                                                                                     | `Proposal.receivedAt`, `Proposal.dueAt`                                                                    |
| `Remarks`                                    | Free-text notes, including things like `"Old Customer17.s.217"` — a prior job reference typed inline                                                                      | `Proposal.notes`                                                                                           |
| `Reference`                                  | **Already holds converted project numbers** — `186.IKP.23`, `187.IKP.26`, `189.IKP.26` — proving conversion-with-linkage is exactly what staff already do by hand         | `Proposal.convertedProjectId` (FK), set only by the convert action                                         |

## 4. Data model

### New: `ProposalSketchType` — the configurable list (decision §5c)

A "fixed list, but configurable" is not a free-text field and not a hardcoded TypeScript enum — it is a
short admin-managed table, the same shape `Role` already is (`schema.prisma`'s `role` table: a small set of
rows an administrator can add to, not a value baked into application code):

```
model ProposalSketchType {
  id    String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code  String @db.VarChar(50)  // e.g. "VILLA_G_PLUS_1"
  label String @db.VarChar(100) // e.g. "Villa - G+1" — what staff actually see and pick

  sortOrder  Int       @default(0)
  archivedAt DateTime? @map("archived_at") @db.Timestamptz(6) // retired, never deleted — a proposal
                                                                // already using it must keep displaying it

  @@unique([code])
  @@map("proposal_sketch_type")
}
```

Seeded with the real values already in use (`Villa - GF Only`, `Villa - G+1`, `Villa - G+1+PH`,
`Farm Houses`, `Extensions`, `Industrial`, `Twin Villa`, `Res/Comm`, `Plot Division`, `Krookie Division`) via
migration, the same way `role`/`role_permission` are seeded — so every environment starts with the same
list, and a System Administrator can add, rename or retire (archive, never delete) an entry afterwards
through a small admin screen, without a code change or redeploy. `Proposal.sketchTypeId` is a nullable FK
to this table rather than a free-text column.

### New: `Proposal`

```
model Proposal {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  clientId   String?  @map("client_id") @db.Uuid
  client     Client?  @relation(fields: [clientId], references: [id], onDelete: Restrict)
  propertyId String?  @map("property_id") @db.Uuid
  property   Property? @relation(fields: [propertyId], references: [id], onDelete: Restrict)

  /// Set at intake, before a formal Client record necessarily exists — see §5.
  contactName  String  @db.VarChar(200)
  contactPhone String? @db.VarChar(50)

  sketchNumber   String  @db.VarChar(50) // generated via SequenceService(SKETCH), e.g. "26-SB-118"
  sketchTypeId   String? @map("sketch_type_id") @db.Uuid
  sketchType     ProposalSketchType? @relation(fields: [sketchTypeId], references: [id], onDelete: SetNull)
  projectType    String? @db.VarChar(20)  // PLANNING / SUPERVISION / BOTH — the eventual Project.type
  approxAreaSqm Decimal? @db.Decimal(10, 2)
  source       String? @db.VarChar(100) // "referral", "walk-in", "old customer", ... (§5)

  assignedArchitectId String? @map("assigned_architect_id") @db.Uuid
  assignedArchitect   User?   @relation(fields: [assignedArchitectId], references: [id], onDelete: SetNull)

  status String @default("NEW") @db.VarChar(20) // never written directly — see §5a below

  receivedAt DateTime? @map("received_at") @db.Date
  dueAt      DateTime? @map("due_at") @db.Date
  notes      String?   @db.Text

  convertedProjectId String?  @map("converted_project_id") @db.Uuid
  convertedProject   Project? @relation(fields: [convertedProjectId], references: [id], onDelete: SetNull)
  convertedAt        DateTime? @map("converted_at") @db.Timestamptz(6)

  version Int @default(1)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy String?  @map("created_by") @db.Uuid

  @@index([status])
  @@index([sketchNumber])
  @@map("proposal")
}
```

`clientId`/`propertyId` are **optional**, deliberately: spec §5's own "Inquiry" stage lists "client,
contact, plot, location" as data captured at first contact, not proof that a formal `Client`/`Property`
already exists — the real register's `Name`/`Mobile Number` columns back this: many entries carry no
column that could be a database FK at all. A proposal can exist against `contactName`/`contactPhone` alone,
and gain `clientId`/`propertyId` once/if those records are created — same posture as Phase 4 §4's "a
property entered before its paperwork arrives is not blocked."

### `SequenceService` — one more type

`apps/api/src/modules/sequence/sequence.types.ts`'s `SEQUENCE_TYPES` gains `'SKETCH'`, with a formatter
producing `YY-SB-NNN` (matching the real register exactly, e.g. `26-SB-118` for the next one after
`26-SB-117`). `ProposalService.create` reserves it the same way `ProjectService.create` already reserves
`PLANNING_PROJECT`/`SUPERVISION_PROJECT` — inside the same transaction as the insert, so a number is never
burned by a failed create.

### Status machine — the fifth consumer of the shared idiom

Spec §5's own status list, unchanged: `New, concept, client revision, approved, won, lost, on hold,
converted`. Modelled exactly like `PROJECT_STATUSES`/`PROJECT_TRANSITIONS`/`canTransitionProject` in
`packages/contracts/src/index.ts`:

```
export const PROPOSAL_STATUSES = [
  'NEW', 'CONCEPT', 'CLIENT_REVISION', 'APPROVED', 'WON', 'LOST', 'ON_HOLD', 'CONVERTED',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_TRANSITIONS = {
  NEW:             ['CONCEPT', 'ON_HOLD', 'LOST'],
  CONCEPT:         ['CLIENT_REVISION', 'ON_HOLD', 'LOST'],
  CLIENT_REVISION: ['CONCEPT', 'APPROVED', 'ON_HOLD', 'LOST'],
  APPROVED:        ['WON', 'LOST'],
  WON:             [], // WON -> CONVERTED happens only via the dedicated convert action, not a status edit
  LOST:            [],
  ON_HOLD:         ['CONCEPT', 'LOST'],
  CONVERTED:       [],
} as const satisfies Record<ProposalStatus, readonly ProposalStatus[]>;

export function canTransitionProposal(from: ProposalStatus, to: ProposalStatus): boolean {
  return (PROPOSAL_TRANSITIONS[from] as readonly ProposalStatus[]).includes(to);
}
```

`WON` has no ordinary transition to `CONVERTED` — reaching `CONVERTED` is only possible through the
dedicated `POST /proposals/:id/convert` action (§5c), the same way a project reaching `CLOSED` (Phase 10,
future) will only be possible through the handover-gated transition, not a bare status write. This is a
deliberate asymmetry, not an oversight: converting creates a second record (`Project`) and must go through
the one code path that does that correctly.

### Convert action

`POST /proposals/:id/convert`, allowed only `WON → CONVERTED`:

1. Refuses if `propertyId` is null — a Planning project requires a real property (`Project.propertyId` is
   `NOT NULL` today), so the proposal must be linked to one before conversion, not have one silently
   fabricated from free-text fields. The refusal message names exactly this, the same way `ProjectService`
   already refuses a duplicate code by name rather than a generic 400.
2. Inside one transaction: reserves a project code via `SequenceService` (`PLANNING_PROJECT` unless
   `projectType` says otherwise), creates the `Project` row carrying `clientId`/`propertyId` across, opens
   its workstreams per `WORKSTREAMS_FOR_TYPE`, and sets the proposal's own `status = CONVERTED`,
   `convertedProjectId`, `convertedAt`.
3. Either everything commits, or none of it does — the same all-or-nothing rule Phase 4 §4 already applied
   to "reserve the number and create the record together."

## 5. Decisions (confirmed, not open anymore)

**a. Bare contact info is enough to start a proposal; a `Client` record can be attached immediately or
later.** `contactName`/`contactPhone` alone create a Proposal. If whoever is logging the inquiry already
has full client details in hand (e.g. taken at a first meeting), they attach `clientId` right away — the
field is simply optional, not staged or two-step. Nothing forces waiting, and nothing forces having it
upfront either.

**b. `source` and `status` are two separate fields, not one.** The real register's `Status` column
(`Old Customer`/`New Customer`) is customer provenance — it becomes `Proposal.source`. Spec §5's own list
(`New, concept, client revision, approved, won, lost, on hold, converted`) is the proposal's actual
lifecycle and drives `Proposal.status` and the state machine below. The two never overlap.

**c. `Type of Sketch` is a fixed list — but an admin-configurable one, not hardcoded.** Built as
`ProposalSketchType` (§4 above): a small table an administrator can add to, rename, or retire, seeded from
the real values already in the register. Staff pick from it; nobody edits code to add "Duplex" next month.

**d. Converting a proposal requires an existing `Property` — no inline creation shortcut.** If
`propertyId` is null, `POST /proposals/:id/convert` refuses, by name, telling the caller to attach or create
the property first. Keeps property data deliberate (matches Phase 4's own posture on `Property`) at the
cost of one extra step for staff when the plot isn't in the system yet.

## 6. Permissions

New resource, four verbs, following the existing `<resource>:<verb>` vocabulary
(`client:*`, `project:*`, `issue:*`, ...):

- `proposal:view`, `proposal:create`, `proposal:edit`, `proposal:convert`

Plus two verbs for the configurable sketch-type list (§4/§5c), mirroring how `role:view`/`role:admin`
already split "everyone can see the list" from "only an administrator can change it":

- `sketch_type:view` (see the list, to pick from it when logging a proposal — bundled into
  `proposal:create`/`proposal:edit` rather than checked separately, since anyone who can touch a proposal
  needs to see its options)
- `sketch_type:admin` (add, rename, retire an entry)

Proposed matrix, in the same migration-as-source-of-truth style as `role_permission`'s seed:

| Role                 | Permissions                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SYSTEM_ADMINISTRATOR | all `proposal:*`, plus `sketch_type:admin`                                                                                   |
| DIRECTOR             | `proposal:view` only — oversight, not data entry (matches its existing posture on every other resource)                      |
| PROJECT_MANAGER      | all `proposal:*`, plus `sketch_type:admin` — proposals are pre-project work under their coordination                         |
| PLANNING             | `proposal:view`, `proposal:create`, `proposal:edit` — architects work proposals day to day; conversion is a manager decision |

All `GLOBAL` scope — a proposal predates any `Project`, so there is no project membership to scope it by,
the same reasoning `client:*`/`property:*` already use.

## 7. Search

Proposals join the pattern `PropertyService`'s search already established (Phase 4 §7): searchable by
`sketchNumber`, `contactName`, and (once linked) the parent `clientId`'s name — so a proposal is findable
the same way staff already refer to a sketch verbally, by its number.

## 8. Build order

| #   | Step                                                                                                                                                                                                                           | Done when                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 21  | **Data model + sequence type** — `ProposalSketchType` migration (seeded with the real values), `Proposal` migration, `SequenceService` gains `SKETCH`, `ProposalService`/`SketchTypeService` CRUD, permission-matrix migration | A proposal can be created with a generated `26-SB-NNN` number and a sketch type picked from the seeded list, no `clientId`/`propertyId` required; permission matrix seeded for all six new verbs |
| 22  | **Status machine** — `PROPOSAL_STATUSES`/`PROPOSAL_TRANSITIONS`/`canTransitionProposal`/`PROPOSAL_ACTIONS` in `@ecms/contracts`; transition endpoint                                                                           | Every transition in §4's table works through a named action; every non-listed transition is refused server-side, proven the same way `PROJECT_TRANSITIONS` already is                            |
| 23  | **Convert action** — `POST /proposals/:id/convert`, transactional, refuses without a `propertyId`                                                                                                                              | A `WON` proposal with a property converts to a numbered `Project` with workstreams opened, `Proposal.status = CONVERTED`, and the link recorded both directions                                  |
| 24  | **Web** — `/proposals` list/new/edit/detail pages (clients-page pattern); a small admin page to manage sketch types; a "Convert to project" button on `WON` proposals; the converted project linked from the detail page       | Tested through the browser, matching the existing Playwright pattern from Steps 12/16/20                                                                                                         |

## 9. Definition of done

- A proposal can be logged with just a contact name and phone, and gets a real `26-SB-NNN` sketch number
  immediately — no `Client`/`Property` required to exist first.
- Every status change goes through a named transition validated server-side; no direct status write is
  possible from the web form, matching the rule every prior state machine in this codebase already follows.
- A `WON` proposal with a `propertyId` set converts to a real Planning (or Supervision/Both) project in one
  transaction — the proposal is marked `CONVERTED` and links to the new project; the project links back.
- A `WON` proposal with no `propertyId` is refused conversion, by name, not a generic error.
- A user without `proposal:view` gets nothing for any proposal endpoint — the same non-member/no-permission
  test every prior resource has.
- Every create, edit, transition and conversion writes an audit row.
- A proposal is searchable by its sketch number, not only by contact name.
- The sketch-type list is seeded with the real values from the register; a System Administrator or Project
  Manager can add, rename, or retire an entry without a code change; an existing proposal keeps showing a
  retired entry rather than losing its data.

All four open questions from the previous draft are resolved — see §5. Ready to start at Step 21.
