# Phase 4 — Property Identity and Real Numbering

> **Source:** the client's own documents, not the PRD — three real ownership records for one plot
> (`ID CARD 25.S.101.pdf`, `KROOKIE 25.S.101.pdf`, `MULKIA 25.S.101.pdf`) and four live Excel registers
> (`2026 Sketch Register - NOuman.xlsx`, `2009 Drawing Project Status.xlsx`, `2011 Supervision Projects.xlsx`,
> `11 Drawings Final.xlsx`), cross-checked against `Engineering_Consultancy_Management_System_Specification.docx`
> §4 and §29 and against `Final_PRD_Engineering_Consultancy_Management_System.docx` §20 (Phase 1 scope,
> already built) and §4 (Core Business Structure). See `docs/PROGRESS.md`'s roadmap note and the plan file
> at `~/.claude/plans/swirling-singing-book.md` for how this fits the full 8-phase sequence (this is the
> first of them).
>
> **Status:** Plan for review. Nothing built yet.
> **Prerequisite:** Phases 1–3 (done — see `docs/PROGRESS.md`).

---

## 1. What Phase 4 is, in one sentence

Give `Property` somewhere to hold the three documents that actually make a plot real (title, survey, owner
identity), and replace today's free-typed, collision-prone project code with a proper generator — the two
smallest, most foundational gaps, done first because every later phase (Proposal, Authority tracking,
Supervision Agreements...) assumes both already exist.

## 2. Why this first

**It's pure data, no new workflow.** Unlike Proposal or Authority tracking, this phase adds columns and one
small new service — no new state machine, no new permission verb, nothing that changes how an existing
screen behaves beyond adding fields to a form already there.

**Everything else depends on it.** Phase 5's Proposal-to-Project conversion needs a real property to attach.
Phase 6's authority tracking is meaningless without a real plot number to submit against. A demo or a real
pilot run today would have nowhere to put the Mulkia/Krookie references already in hand.

**It's where a numbering mistake is cheapest to catch.** `Project.code` is currently free text with only a
uniqueness constraint (`apps/api/prisma/schema.prisma:640`; `apps/web/src/app/(app)/projects/new/page.tsx:63-67`).
Every later phase that mints its own number (Sketch IDs in Phase 5, submission/permit references in Phase 6)
should reuse the same generator, not invent a fourth ad-hoc one.

## 3. What the client's real documents show

**The three sample documents, read together, are one property's complete paper trail:**

| Document                                                        | What it proves                                                                                                                               | Field it needs                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `MULKIA 25.S.101.pdf` (title deed — سند ملكية)                  | Legal ownership: plot `8/102`, Seeb, Al Mawaleh South, 1,808 m², owner **Nasreen bint Abdul Rahim bin Sheikh**, via gift deed no. 2015/19618 | `titleDeedReference`, `ownerName`                     |
| `KROOKIE 25.S.101.pdf` (survey/plot plan — Ministry of Housing) | The plot's own serial `1-35-055-01-585`, coordinates, area, and the building conditions (height, floors, setbacks) tied to that exact parcel | `surveyReference`, `plotNumber`, `wilayat`, `village` |
| `ID CARD 25.S.101.pdf`                                          | The registered owner's national ID (civil number `62898538`)                                                                                 | `ownerNationalId`                                     |

None of these have anywhere to go today — `Property` (`schema.prisma:240-268`) has only generic
`name`/`addressLine1-2`/`city`/`postcode`/`country`/`reference`. A real Omani property record is
**identified by its plot and survey number, not a postal address** — Oman doesn't use street addresses for
this purpose the way the current fields assume.

**Where the scanned PDFs themselves go:** not a new upload target. Once a project exists against this
property, these three files upload through the **existing** Document register (Phase 3, Step 15) like any
other file — `category: "Authority"` or similar, no `linkedType` needed since they belong to the project as a
whole rather than to one activity/visit/issue/submission. The new `Property` fields below are the
**structured reference numbers**, so the plot is searchable and identifiable without opening a PDF — the
files are evidence, the fields are the index.

**The registers show three, possibly overlapping, live numbering series:**

| Register                                  | Format seen                                                                                                     | Volume evidence                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `2026 Sketch Register`                    | `26-SB-101` … `26-SB-117` (17 entries logged in ~2 weeks of August 2026)                                        | Matches spec §2's "~25 inquiries/month" closely                                         |
| `2009 Drawing Project Status`             | `09.S.101` … `09.S.242`+ (140+ in one year)                                                                     | The sample docs' own filename (`25.S.101`) is this exact series, just from a later year |
| `2026 Sketch Register`, "Project#" column | `192.IKP.26`, `191.IKP.26`, `190.IKP.26`... alongside an unrelated old reference `186.IKP.23` cited as a remark | Ambiguous — see Open Question below                                                     |

## 4. Data model

### `Property` — add five columns, all optional (existing rows stay valid)

```
model Property {
  ...existing fields unchanged...

  plotNumber        String? @db.VarChar(50)   // Krookie's "القطعة" — e.g. "102/8"
  wilayat           String? @db.VarChar(100)  // Krookie's "الولاية" — e.g. "Al Seeb"
  village           String? @db.VarChar(100)  // Krookie's "القرية/الحي" — e.g. "Al Mawaleh South"
  surveyReference   String? @db.VarChar(100)  // Krookie's own serial — e.g. "1-35-055-01-585"
  titleDeedReference String? @db.VarChar(100) // Mulkia's deed/gift reference — e.g. "2015/19618"
  ownerName         String? @db.VarChar(200)  // registered owner per the title deed — may differ from Client
  ownerNationalId   String? @db.VarChar(50)   // civil number off the ID card
}
```

All optional, matching how `reference`/`addressLine1-2` are already optional — a property entered before
the paperwork arrives, or one where an address genuinely is the right identifier, is not blocked. No index
is added on these beyond what search already needs (§7 below); they are reference data, not a new
uniqueness rule — two properties can legitimately share an owner.

**Decision: owner identity lives on `Property`, not `Client`.** The Mulkia's registered owner
("Nasreen bint Abdul Rahim bin Sheikh", via a _gift_ deed) is a legal fact about the land, independent of
who the consultancy's actual contracting customer is — a common real case is a parent gifting land to a
child who then becomes the `Client`, or an owner who is never the client at all (an agent handles everything).
Putting these fields on `Property` keeps that distinction intact instead of assuming client == owner.

### New: `sequence_counter` table (the numbering service's storage)

```
model SequenceCounter {
  sequenceType String @db.VarChar(30)   // e.g. "SKETCH", "SUPERVISION_PROJECT"
  year         Int
  lastValue    Int    @default(0)

  @@id([sequenceType, year])
  @@map("sequence_counter")
}
```

One row per `(type, year)`. `SequenceService.next(type, year)` does the same atomic increment shape already
proven safe under concurrency in this codebase — `DrawingRevisionService.create` (`drawing-revision.service.ts:67-110`)
already supersedes-then-inserts inside one transaction specifically to avoid a race between two concurrent
writers; `SequenceService.next` does the equivalent with a single `UPDATE ... SET last_value = last_value + 1
WHERE sequence_type = $1 AND year = $2 RETURNING last_value` (an upsert if the row doesn't exist yet),
inside the caller's own transaction so "reserve the number" and "create the record" commit or fail together
— a project is never created with no number, and a number is never burned by a create that then fails.

Formatting is a small pure function per type, not stored logic:

```
format('SUPERVISION_PROJECT', year=2026, value=101) -> "26.S.101"
format('SKETCH',              year=2026, value=101) -> "26-SB-101"
```

Kept as a lookup table of formatters (one line each), the same "changing this is a data change, not a
rewrite" philosophy `docs/phase-1-plan.md` §5 already applied to the permission matrix.

### `Project.code` becomes generated by default, still overridable

`ProjectService.create` (`project.service.ts:109-166`) generates `code` via `SequenceService` when the
caller doesn't supply one, keyed off `Project.type` (Planning vs. Supervision get different formatters —
see Open Question below for which literal format each gets). An explicit `code` in the request is still
honoured and still goes through the existing uniqueness catch (`rethrowDuplicateCode`, `project.service.ts:326-331`)
unchanged — needed so historical projects being migrated in, which won't fit any generator's pattern, are
never blocked.

## 5. Open question — confirm with the client before the generator ships for Planning projects

Two of the three real formats are solid evidence: `26-SB-101` (Sketch) and `09.S.101`/`26.S.101`
(Supervision — literally the sample documents' own filenames) both show a clean annual reset with matching
volume. The third, `192.IKP.26`, is **not** solid evidence of an annual-reset scheme — the one cross-reference
available (`186.IKP.23`, cited as an old customer's prior reference from 2023) implies the counter may run
**continuously across years** rather than resetting, since going from 186 in 2023 to 192 in 2026 is far too
small a jump for the ~10-15 Planning projects/month the spec claims, if it resets every January.

**Proposed default, safe to ship now, cheap to correct:** give Planning-type projects the same
shape as Supervision (`YY.P.NNN`, annual reset) for internal consistency, and treat `IKP` as a **separate,
possibly non-resetting reference** the client may already track by hand — store it as free text on `Project`
if/when confirmed, rather than guessing its reset rule into the generator. This is the same posture Phase 3
took with `DrawingRevision.revisionCode` (`docs/phase-3-plan.md` §8, item B4): accept a sensible default,
validate structurally, and let the real convention arrive as a small follow-up rather than block on it.

## 6. Permissions

None new. `property:edit`/`property:create` already gate every field on `Property`, including the five new
ones — they are additional columns on an existing resource, not a new one. The numbering service has no
permission of its own; it is invoked by `ProjectService.create`, which is already gated by `project:create`.

## 7. Search

`PropertyService`'s existing `query.search` filter (`property.service.ts:20-26`) extends to include
`plotNumber` and `surveyReference` alongside whatever it already matches — a property should be findable by
its plot number, which in practice is how staff already refer to a site verbally, more often than by name.

## 8. Build order

| #   | Step                                                                                                                                 | Done when                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | **Property fields** — migration adding the five columns; `PropertyService`/web form/contracts updated                                | A property can be created or edited with plot number, wilayat, village, survey reference, title deed reference, owner name and owner national ID; all optional; existing properties unaffected                 |
| 18  | **Sequence service** — `sequence_counter` table, `SequenceService.next`, the per-type formatter lookup                               | Two concurrent calls for the same `(type, year)` never produce the same number, proven the same way `DrawingRevisionService`'s no-duplicate-current-revision test already proves its own concurrency guarantee |
| 19  | **Wire into `Project.create`** — default-generate `code` from `Project.type`, still accept an explicit override                      | A Supervision project created without a `code` gets `26.S.NNN`; a Planning project gets `26.P.NNN`; an explicit `code` still works and still enforces uniqueness                                               |
| 20  | **Web** — property form gains the five fields; project-creation form shows the generated code as read-only with an "override" toggle | Both forms tested through the browser, matching the existing Playwright pattern from Step 16                                                                                                                   |

## 9. Definition of done

- A property can record plot number, wilayat, village, survey reference, title deed reference, owner name
  and owner national ID — all optional, none breaking an existing property record.
- Creating a project with no `code` gets one generated in the correct format for its type and the current
  year; creating a second project of the same type in the same year gets the next number, never a collision,
  proven under concurrent creation the same way drawing-revision creation already is.
- An explicit `code` still works exactly as it does today, for migrated historical data.
- A property is searchable by plot number or survey reference, not only by name.
- Every change still writes an audit row — no new exemption is introduced.

## 10. What I need from you before starting

1. **Confirm the five new `Property` fields** are the right ones, or say what a "wrong" property record
   looks like in practice that these don't cover (e.g., a property with no formal Mulkia yet — a proposal
   stage plot — should that be allowed? Current design says yes, since all five fields are optional).
2. **The IKP numbering question in §5** — is it annual-reset or continuous? If you don't know offhand, the
   proposed default (treat it as a separate, unconfirmed reference field rather than build the generator
   around it) ships regardless and can be corrected once you do.
3. **Confirm Planning projects should get `YY.P.NNN`** as their default format, or supply the real one if
   there already is one in use that just wasn't in the sample registers.
