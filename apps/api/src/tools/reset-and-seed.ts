/**
 * Wipes every transactional record from the database except one chosen user,
 * then inserts one fully-populated sample of every module, printing a
 * numbered step-by-step walkthrough — every field, every id, why each record
 * links to the one before it, and exactly where a PDF gets inserted — so the
 * whole data flow can be understood and then re-driven by hand.
 *
 *   node dist/tools/reset-and-seed.js <username-to-keep>
 *
 * Deliberately NOT wired into any npm script — this is destructive and is run
 * by hand, once, against a development database only.
 *
 * Runs against MIGRATION_DATABASE_URL (the ecms_owner account) because the
 * wipe needs to clear audit_entry (ecms_app has no DELETE grant on it, by
 * design — see schema.prisma) and needs to remove drawing_revision rows,
 * which a plain DELETE cannot do once one is APPROVED (see the
 * drawing_revision_immutable trigger). TRUNCATE bypasses that row-level
 * trigger, which is exactly what a full development reset needs and exactly
 * what the application itself must never be able to do.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { LocalDriveAdapter } from '../shared/drive/local-drive-adapter';

const BAR = '='.repeat(88);
let stepNumber = 0;

/** One numbered block: what got created, why it links to what came before,
 *  and every field on the row(s) — the whole point being that a human
 *  reading console output can follow the flow, not just see a data dump. */
function step(title: string, why: string, data: unknown): void {
  stepNumber += 1;
  console.log(`\n${BAR}`);
  console.log(`STEP ${stepNumber}: ${title}`);
  console.log(BAR);
  console.log(why);
  console.log('');
  console.log(JSON.stringify(data, null, 2));
}

/** Same numbering sequence, for a step that is an instruction rather than a
 *  created row — e.g. "go upload this PDF here". */
function actionStep(title: string, body: string[]): void {
  stepNumber += 1;
  console.log(`\n${BAR}`);
  console.log(`STEP ${stepNumber}: ${title}`);
  console.log(BAR);
  for (const line of body) console.log(line);
}

const escapePdfText = (text: string): string => text.replace(/[\\()]/g, (c) => `\\${c}`);

/** A tiny but genuinely valid single-page PDF — real magic bytes, real xref
 *  table, opens in any PDF viewer — so upload testing exercises real PDF
 *  content, not a text file wearing a .pdf extension. */
function buildMinimalPdf(title: string, body: string): Buffer {
  const objects: Record<number, string> = {
    1: '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    2: '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    3: '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    5: '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  };
  const stream = `BT /F1 18 Tf 50 720 Td (${escapePdfText(title)}) Tj 0 -28 Td /F1 12 Tf (${escapePdfText(body)}) Tj ET`;
  objects[4] = `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += objects[i];
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const TRUNCATE_TABLES = [
  'client',
  'property',
  'contact',
  'project',
  'workstream',
  'planning_activity',
  'milestone',
  'submission',
  'submission_review',
  'submission_meeting',
  'site_visit',
  'supervision_agreement',
  'observation',
  'instruction',
  'issue',
  'drawing',
  'drawing_revision',
  'modification',
  'document',
  'handover_checklist',
  'proposal',
  'drive_file',
  'audit_entry',
  'sequence_counter',
];

async function main(): Promise<void> {
  const [username] = process.argv.slice(2);
  if (!username) {
    console.error('Usage: reset-and-seed <username-to-keep>');
    process.exit(1);
  }

  const host = process.env['DB_HOST'] ?? 'localhost';
  const port = process.env['DB_PORT'] ?? '5432';
  const name = process.env['DB_NAME'] ?? 'ecms';
  const user = process.env['DB_OWNER_USER'] ?? 'ecms_owner';
  const password = encodeURIComponent(process.env['DB_OWNER_PASSWORD'] ?? '');
  const migrationUrl = `postgresql://${user}:${password}@${host}:${port}/${name}`;
  const prisma = new PrismaClient({ datasourceUrl: migrationUrl });
  const drive = new LocalDriveAdapter();
  const driveRoot = resolve(process.env['LOCAL_DRIVE_DIR'] ?? './.local-drive');
  const api = 'http://localhost:3001';

  const keepUser = await prisma.user.findUnique({ where: { username } });
  if (!keepUser) {
    console.error(`Refusing: no user with username "${username}" exists.`);
    process.exit(1);
  }

  console.log(`Keeping user: ${keepUser.username} (${keepUser.id})`);
  console.log('Wiping every other user and all transactional data...');

  // Real FK, ON DELETE CASCADE — takes session, user_role and project_member
  // with it. No FK exists from anything else to user (deliberate, see the
  // comments on createdBy/assigneeId/ownerId throughout schema.prisma), so
  // nothing else needs touching here.
  await prisma.user.deleteMany({ where: { id: { not: keepUser.id } } });
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE;`);
  await rm(driveRoot, { recursive: true, force: true });
  await mkdir(driveRoot, { recursive: true });

  console.log('Database and local drive storage wiped. Seeding, one step at a time...');

  const requiredDocs = await prisma.requiredDocument.findMany({ where: { archivedAt: null } });
  const sketchTypes = await prisma.proposalSketchType.findMany({ where: { archivedAt: null } });

  const uploadPdfFile = async (relDir: string, baseName: string, title: string, body: string) => {
    const bytes = buildMinimalPdf(title, body);
    const { fileId } = await drive.upload(bytes, relDir);
    return {
      fileId,
      absolutePath: resolve(driveRoot, fileId),
      sizeBytes: bytes.length,
      filename: `${baseName}.pdf`,
    };
  };

  // --- 1. The user everything else is attributed to --------------------------
  step(
    'The surviving user',
    'Every record created from here on sets createdBy (and, where relevant, ownerId/assigneeId) ' +
      'to this id. Sign in with this account to see all of it.',
    keepUser,
  );

  // --- 2. Client, contact, property -------------------------------------------------
  const client = await prisma.client.create({
    data: {
      name: 'Al Falaj Trading LLC',
      reference: 'CL-DEMO-001',
      notes: 'Seeded for manual testing.',
      createdBy: keepUser.id,
    },
  });
  step(
    'Client',
    'The organisation receiving consultancy services. Nothing points at it yet — ' +
      'a Contact and a Property both hang off client.id next.',
    client,
  );

  const contact = await prisma.contact.create({
    data: {
      clientId: client.id,
      name: 'Salim Al Balushi',
      position: 'Managing Director',
      email: 'salim.albalushi@example.com',
      phone: '+968 9123 4567',
      isPrimary: true,
    },
  });
  step(
    'Contact',
    `contact.clientId = ${client.id} — a named person at that client. isPrimary marks ` +
      'the default person to reach, enforced unique per client by a partial index.',
    contact,
  );

  const property = await prisma.property.create({
    data: {
      clientId: client.id,
      name: 'Al Khoud Villa Plot',
      reference: 'PR-DEMO-001',
      addressLine1: 'Way 3241, Al Khoud',
      addressLine2: 'Near Sultan Qaboos University',
      city: 'Muscat',
      postcode: '123',
      country: 'Oman',
      plotNumber: '1-35-055-01-585',
      wilayat: 'Seeb',
      village: 'Al Khoud',
      surveyReference: '1-35-055-01-585',
      titleDeedReference: '2015/19618',
      ownerName: 'Salim Al Balushi',
      ownerNationalId: '12345678',
      createdBy: keepUser.id,
    },
  });
  step(
    'Property',
    `property.clientId = ${client.id} — the physical site this client owns. plotNumber/wilayat/` +
      'village/surveyReference/titleDeedReference are Oman land-registry identity fields, separate ' +
      'from the postal address above. This is what a Project gets built against next.',
    property,
  );

  // --- 3. Project, workstreams, membership --------------------------------------------
  const project = await prisma.project.create({
    data: {
      clientId: client.id,
      propertyId: property.id,
      code: 'PRJ-DEMO-001',
      name: 'Al Khoud Villa — Planning & Supervision',
      description: 'Demo project seeded for manual testing.',
      type: 'BOTH',
      status: 'ACTIVE',
      startDate: new Date('2026-01-15'),
      targetEndDate: new Date('2026-12-31'),
      createdBy: keepUser.id,
    },
  });
  step(
    'Project',
    `project.clientId = ${client.id}, project.propertyId = ${property.id} — this is the unit of ` +
      'authorization for everything below: every planning/supervision/drawing/document/issue row ' +
      'resolves to exactly one project.id. type=BOTH means it opens both workstreams below. ' +
      'status moves only through named actions (activate/hold/complete/close), never a plain edit.',
    project,
  );

  const [planningWorkstream, supervisionWorkstream] = await Promise.all([
    prisma.workstream.create({
      data: { projectId: project.id, type: 'PLANNING', name: 'Planning', status: 'IN_PROGRESS' },
    }),
    prisma.workstream.create({
      data: { projectId: project.id, type: 'SUPERVISION', name: 'Supervision', status: 'IN_PROGRESS' },
    }),
  ]);
  step(
    'Workstreams (one per project.type)',
    `Both reference projectId = ${project.id}. A BOTH project always opens exactly one PLANNING ` +
      'and one SUPERVISION workstream — that is what everything from Step 6 onward runs inside of.',
    [planningWorkstream, supervisionWorkstream],
  );

  const membership = await prisma.projectMember.create({
    data: { projectId: project.id, userId: keepUser.id, roleCode: 'PROJECT_MANAGER', grantedBy: keepUser.id },
  });
  step(
    'Project membership',
    `Links userId = ${keepUser.id} to projectId = ${project.id}. This is what turns a PROJECT-scoped ` +
      "permission into something concrete: the user's global role (from Step 1) says WHAT they may " +
      'do; this row says WHERE. Without it, a non-admin role would be refused access to this project.',
    membership,
  );

  // --- 4. Planning workstream: activities, milestones, submission ---------------------
  const planningActivity = await prisma.planningActivity.create({
    data: {
      projectId: project.id,
      name: 'Prepare concept design',
      description: 'Initial concept design for client review.',
      assigneeId: keepUser.id,
      dueDate: new Date('2026-10-01'),
      createdBy: keepUser.id,
    },
  });
  step(
    'Planning activity',
    `projectId = ${project.id}. A checkbox-style task (done: true/false), no state machine. ` +
      'assigneeId has no foreign key on purpose — an archived user must never break this record.',
    planningActivity,
  );

  const milestone = await prisma.milestone.create({
    data: {
      projectId: project.id,
      name: 'Municipality submission',
      targetDate: new Date('2026-11-01'),
      createdBy: keepUser.id,
    },
  });
  step(
    'Milestone',
    `projectId = ${project.id}. achievedDate is null until reached — set once, cleared by nothing.`,
    milestone,
  );

  const submission = await prisma.submission.create({
    data: {
      projectId: project.id,
      reference: 'SUB-DEMO-001',
      authorityName: 'Seeb Municipality',
      department: 'PLANNING',
      status: 'UNDER_REVIEW',
      pendingWith: 'authority',
      createdBy: keepUser.id,
    },
  });
  step(
    'Submission (planning authority application)',
    `projectId = ${project.id}. Seeded straight to UNDER_REVIEW so the state-machine section below can approve it ` +
      'immediately. Uses the shared approval state machine: DRAFT -> SUBMITTED -> UNDER_REVIEW -> ' +
      'APPROVED / REJECTED / RETURNED_FOR_REVISION (plus WITHDRAWN/HALTED/CANCELLED).',
    submission,
  );

  const submissionReview = await prisma.submissionReview.create({
    data: {
      submissionId: submission.id,
      reviewDate: new Date('2026-09-01'),
      reviewerName: 'Municipality Reviewer',
      comments: 'Requested clarification on setback distances.',
      responseDueAt: new Date('2026-09-15'),
      createdBy: keepUser.id,
    },
  });
  const submissionMeeting = await prisma.submissionMeeting.create({
    data: {
      submissionId: submission.id,
      required: true,
      meetingAt: new Date('2026-09-10T09:00:00Z'),
      attendees: 'Project Manager, Municipality Reviewer',
      purpose: 'Discuss setback clarification',
      createdBy: keepUser.id,
    },
  });
  step(
    'Submission review + meeting round',
    `Both reference submissionId = ${submission.id}. Never deleted — one review round is a ` +
      'permanent fact, the same posture SiteVisit and SubmissionReview both take.',
    { submissionReview, submissionMeeting },
  );

  // --- 5. Supervision workstream: agreement, site visit, observation, instruction -----
  const supervisionAgreement = await prisma.supervisionAgreement.create({
    data: {
      projectId: project.id,
      type: 'MONTHLY',
      visitsAllowed: 4,
      amount: 500.0,
      startDate: new Date('2026-01-15'),
      createdBy: keepUser.id,
    },
  });
  step(
    'Supervision agreement',
    `projectId = ${project.id}. The commercial terms site visits happen under — MONTHLY here means ` +
      'visitsAllowed is a per-month quota (ON_CALL would make it a quota for the whole period).',
    supervisionAgreement,
  );

  const siteVisit = await prisma.siteVisit.create({
    data: {
      projectId: project.id,
      visitDate: new Date('2026-09-05'),
      attendees: 'Site Engineer, Contractor Foreman',
      notes: 'Routine supervision visit.',
      createdBy: keepUser.id,
    },
  });
  step(
    'Site visit',
    `projectId = ${project.id}. A visit that happened is a permanent fact — never archived, never ` +
      'deleted. Observation and Instruction both hang off this visit next.',
    siteVisit,
  );

  const observation = await prisma.observation.create({
    data: {
      siteVisitId: siteVisit.id,
      description: 'Rebar spacing on ground floor slab wider than drawing spec.',
      category: 'Structural',
      createdBy: keepUser.id,
    },
  });
  step(
    'Observation',
    `siteVisitId = ${siteVisit.id}. Something seen on the visit, with no lifecycle of its own. ` +
      'Step 8 turns this specific observation into a tracked Issue.',
    observation,
  );

  const instruction = await prisma.instruction.create({
    data: {
      siteVisitId: siteVisit.id,
      directiveText: 'Correct rebar spacing to match approved drawing before pouring.',
      assigneeId: keepUser.id,
      dueDate: new Date('2026-09-08'),
      createdBy: keepUser.id,
    },
  });
  step(
    'Instruction',
    `siteVisitId = ${siteVisit.id}. A directive given during the same visit. actionedAt (currently ` +
      'null) is set once done, the same "date-or-not" treatment Milestone.achievedDate uses.',
    instruction,
  );

  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      observationId: observation.id,
      title: 'Incorrect rebar spacing on ground floor slab',
      description: 'Spacing measured at 250mm against a 200mm spec.',
      severity: 'HIGH',
      priority: 'HIGH',
      ownerId: keepUser.id,
      dueDate: new Date('2026-09-08'),
      status: 'OPEN',
      workstreamType: 'SUPERVISION',
      createdBy: keepUser.id,
    },
  });
  step(
    'Issue',
    `projectId = ${project.id}, observationId = ${observation.id} — this is what the observation ` +
      'above "became" once it needed tracking to closure. Its own machine: OPEN -> IN_PROGRESS -> ' +
      'RESOLVED -> CLOSED (or reopen). The state-machine section below drives it through this whole chain.',
    issue,
  );

  // --- 6. Drawings ----------------------------------------------------------------
  const drawingFile = await uploadPdfFile(
    `projects/${project.code}/drawings`,
    'GF-Plan-P1',
    'Ground Floor Plan — Revision P1',
    'Demo ground floor plan drawing, seeded for manual testing.',
  );

  const drawing = await prisma.drawing.create({
    data: {
      projectId: project.id,
      number: 'DRW-001',
      title: 'Ground Floor Plan',
      createdBy: keepUser.id,
    },
  });
  step(
    'Drawing (identity only — no file yet)',
    `projectId = ${project.id}. Stable identity; currentRevisionId is null until a revision is ` +
      'uploaded, which is the next step. A drawing is registered, then revised.',
    drawing,
  );

  const drawingRevision = await prisma.drawingRevision.create({
    data: {
      drawingId: drawing.id,
      revisionCode: 'P1',
      status: 'SUBMITTED',
      uploadStatus: 'ACTIVE',
      fileId: drawingFile.fileId,
      originalFilename: drawingFile.filename,
      mimeType: 'application/pdf',
      sizeBytes: drawingFile.sizeBytes,
      notes: 'First issue for authority submission.',
      createdBy: keepUser.id,
    },
  });
  await prisma.drawing.update({ where: { id: drawing.id }, data: { currentRevisionId: drawingRevision.id } });
  step(
    'Drawing revision — the PDF bytes are inserted HERE',
    `drawingId = ${drawing.id}. This is the append-only row that actually carries a file: fileId is ` +
      "the LocalDriveAdapter's own path, uploadStatus ACTIVE means the bytes are confirmed written. " +
      `A real PDF was generated and written to disk at:\n     ${drawingFile.absolutePath}\n` +
      'Once status reaches APPROVED, a database trigger makes this exact row permanently ' +
      'un-updatable and un-deletable — seeded at SUBMITTED here so the state-machine section below can walk it to APPROVED.',
    drawingRevision,
  );

  // --- 7. Modification --------------------------------------------------------------
  const modification = await prisma.modification.create({
    data: {
      projectId: project.id,
      requestText: 'Client requests moving the kitchen window 500mm to the left.',
      impactArea: 'ARCHITECTURE',
      costImpact: 'Negligible',
      timeImpact: 'None',
      drawingRevisionId: drawingRevision.id,
      observationId: observation.id,
      status: 'SUBMITTED',
      createdBy: keepUser.id,
    },
  });
  step(
    'Modification (client-requested change)',
    `projectId = ${project.id}, drawingRevisionId = ${drawingRevision.id}, observationId = ` +
      `${observation.id} — both links optional and independent; this one deliberately uses both, so ` +
      'you can see a modification tied to both a drawing on file and something seen on a visit. Same ' +
      'shared approval machine as the drawing revision above.',
    modification,
  );

  // --- 8. Documents (one per required-document category, so completeness has data) --
  const documents: Array<{ category: string; label: string; doc: Awaited<ReturnType<typeof prisma.document.create>>; path: string }> = [];
  for (const req of requiredDocs) {
    const file = await uploadPdfFile(
      `projects/${project.code}/documents`,
      req.category.replace(/\s+/g, '-'),
      req.label,
      `Demo "${req.label}" document, seeded for manual testing.`,
    );
    const doc = await prisma.document.create({
      data: {
        projectId: project.id,
        category: req.category,
        title: req.label,
        description: `Seeded document satisfying the "${req.category}" requirement.`,
        uploadStatus: 'ACTIVE',
        fileId: file.fileId,
        originalFilename: file.filename,
        mimeType: 'application/pdf',
        sizeBytes: file.sizeBytes,
        createdBy: keepUser.id,
      },
    });
    documents.push({ category: req.category, label: req.label, doc, path: file.absolutePath });
  }
  step(
    'Documents — one real PDF per required-document category',
    `Each has projectId = ${project.id} and a category that matches a row from the admin-configured ` +
      'RequiredDocument catalogue below by VALUE, not a foreign key (document.category is free text ' +
      'on purpose). This is what Step 14\'s completeness check reads. A real PDF was written to disk ' +
      'for every single one — file path is printed under each record.',
    documents.map((d) => ({ category: d.category, label: d.label, record: d.doc, fileOnDisk: d.path })),
  );

  console.log(`\nRequired-documents catalogue matched above (admin-configured, unchanged by this reset):`);
  console.log(JSON.stringify(requiredDocs, null, 2));

  // --- 9. Handover checklist ----------------------------------------------------------
  const handover = await prisma.handoverChecklist.create({
    data: {
      projectId: project.id,
      finalInspectionAt: new Date('2026-09-01'),
      authorityDocsReceivedAt: null,
      testsReceivedAt: null,
      asBuiltReceivedAt: null,
      warrantiesReceivedAt: null,
      finalReportIssuedAt: null,
    },
  });
  step(
    'Handover checklist',
    `projectId = ${project.id} (unique — at most one per project). Each field is a date-or-not ` +
      'closure item; finalInspectionAt is already set here, the rest left open for you to fill in ' +
      'by hand through the closure screen.',
    handover,
  );

  // --- 10. Proposal ----------------------------------------------------------------
  const proposal = await prisma.proposal.create({
    data: {
      clientId: client.id,
      propertyId: property.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      sketchNumber: '26-SB-DEMO-001',
      sketchTypeId: sketchTypes[0]?.id ?? null,
      projectType: 'BOTH',
      approxAreaSqm: 450.5,
      source: 'referral',
      assignedArchitectId: keepUser.id,
      status: 'NEW',
      receivedAt: new Date('2026-09-01'),
      dueAt: new Date('2026-09-20'),
      notes: 'Seeded proposal, not yet converted.',
      createdBy: keepUser.id,
    },
  });
  step(
    'Proposal (separate from the project above — this one is not yet converted)',
    `clientId = ${client.id}, propertyId = ${property.id}, sketchTypeId = ${proposal.sketchTypeId} ` +
      "(from the ProposalSketchType catalogue). Its own inquiry-to-project lifecycle: NEW -> CONCEPT " +
      '-> CLIENT_REVISION -> APPROVED -> WON -> CONVERTED. convertedProjectId is null until the convert action (below) ' +
      'convert action mints a brand-new Project from it — a second project alongside PRJ-DEMO-001.',
    proposal,
  );

  // --- 11. A standalone PDF, NOT yet in the database, for testing the upload flow itself ---
  const sampleUploadPath = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'sample-upload.pdf');
  await mkdir(resolve(sampleUploadPath, '..'), { recursive: true });
  await writeFile(
    sampleUploadPath,
    buildMinimalPdf('ECMS Sample Upload', 'Use this file to test document/drawing upload by hand.'),
  );
  actionStep('A spare PDF for you to upload by hand', [
    'Every PDF so far (drawing + 6 documents) was already inserted into the database for you.',
    'This one is deliberately NOT registered anywhere — use it to watch a fresh upload happen,',
    'either through the web UI\'s file picker or with curl -F (see the upload steps below):',
    `\n    ${sampleUploadPath}\n`,
  ]);

  // --- 12. Drive every state machine to completion, one action at a time --------------
  console.log(`\n${BAR}`);
  console.log('DRIVE EVERY STATE MACHINE (curl, using a cookie jar for the session)');
  console.log(BAR);

  actionStep('Sign in first — every command below reuses cookies.txt', [
    `curl -c cookies.txt -X POST ${api}/auth/login -H 'Content-Type: application/json' ` +
      `-d '{"identifier":"${keepUser.username}","password":"<your password>"}'`,
  ]);

  actionStep(`Issue: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED  (id ${issue.id})`, [
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/issues/${issue.id}/start ` +
      `-H 'Content-Type: application/json' -d '{"version":1}'`,
    `curl -b cookies.txt -X PATCH ${api}/projects/${project.id}/issues/${issue.id} ` +
      `-H 'Content-Type: application/json' -d '{"version":1,"closureNotes":"Rebar corrected and re-inspected."}'  ` +
      '# optional: closure evidence, independent of the transition below',
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/issues/${issue.id}/resolve ` +
      `-H 'Content-Type: application/json' -d '{"version":2,"reason":"Corrected and re-inspected on site."}'`,
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/issues/${issue.id}/close ` +
      `-H 'Content-Type: application/json' -d '{"version":3}'`,
  ]);

  actionStep(
    `Drawing revision: SUBMITTED -> UNDER_REVIEW -> APPROVED  (drawing ${drawing.id}, revision ${drawingRevision.id})`,
    [
      `curl -b cookies.txt -X POST ${api}/projects/${project.id}/drawings/${drawing.id}/revisions/${drawingRevision.id}/review ` +
        `-H 'Content-Type: application/json' -d '{"version":1}'`,
      `curl -b cookies.txt -X POST ${api}/projects/${project.id}/drawings/${drawing.id}/revisions/${drawingRevision.id}/approve ` +
        `-H 'Content-Type: application/json' -d '{"version":2}'`,
      '  Once APPROVED, the drawing_revision_immutable trigger makes this exact row permanently un-updatable and un-deletable.',
    ],
  );

  actionStep(`Modification: SUBMITTED -> UNDER_REVIEW -> APPROVED  (id ${modification.id})`, [
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/modifications/${modification.id}/review ` +
      `-H 'Content-Type: application/json' -d '{"version":1}'`,
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/modifications/${modification.id}/approve ` +
      `-H 'Content-Type: application/json' -d '{"version":2}'`,
  ]);

  actionStep(`Submission: UNDER_REVIEW -> APPROVED  (id ${submission.id})`, [
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/planning/submissions/${submission.id}/approve ` +
      `-H 'Content-Type: application/json' -d '{"version":1,"permitReference":"PERMIT-2026-001"}'`,
  ]);

  actionStep(
    `Proposal: NEW -> CONCEPT -> CLIENT_REVISION -> APPROVED -> WON -> CONVERTED  (id ${proposal.id})`,
    [
      `curl -b cookies.txt -X POST ${api}/proposals/${proposal.id}/start-concept ` +
        `-H 'Content-Type: application/json' -d '{"version":1}'`,
      `curl -b cookies.txt -X POST ${api}/proposals/${proposal.id}/send-for-client-review ` +
        `-H 'Content-Type: application/json' -d '{"version":2}'`,
      `curl -b cookies.txt -X POST ${api}/proposals/${proposal.id}/approve ` +
        `-H 'Content-Type: application/json' -d '{"version":3}'`,
      `curl -b cookies.txt -X POST ${api}/proposals/${proposal.id}/win ` +
        `-H 'Content-Type: application/json' -d '{"version":4}'`,
      `curl -b cookies.txt -X POST ${api}/proposals/${proposal.id}/convert ` +
        `-H 'Content-Type: application/json' -d '{"version":5}'  # mints a brand-new Project`,
    ],
  );

  actionStep('Upload the spare PDF as a brand-new document', [
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/documents ` +
      `-F 'category=Design' -F 'title=Manual upload test' -F "file=@${sampleUploadPath}"`,
  ]);

  actionStep('Upload the spare PDF as a brand-new drawing revision (P2 on the same drawing)', [
    `curl -b cookies.txt -X POST ${api}/projects/${project.id}/drawings/${drawing.id}/revisions ` +
      `-F 'revisionCode=P2' -F "file=@${sampleUploadPath}"`,
  ]);

  actionStep('Check document completeness against the required-documents catalogue', [
    `curl -b cookies.txt ${api}/projects/${project.id}/documents/completeness`,
  ]);

  console.log(
    '\nEach action above bumps `version` by 1 on success. If a call is rejected with a version ' +
      'conflict, GET the same resource first and use the version it reports.',
  );

  // --- Final summary ----------------------------------------------------------
  console.log(`\n${BAR}`);
  console.log('SUMMARY');
  console.log(BAR);
  console.log(`Sign in as:        ${keepUser.username}`);
  console.log(`Project id/code:   ${project.id} / ${project.code}`);
  console.log(`Local drive root:  ${driveRoot}`);
  console.log(`Spare upload PDF:  ${sampleUploadPath}`);
  console.log(BAR);

  await prisma.$disconnect();
}

void main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
