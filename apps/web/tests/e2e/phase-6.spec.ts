import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 6's definition of done, performed through the browser
 * (docs/phase-6-plan.md §9): a submission moves through halt/resume and
 * cancel via named actions, approving without a permit reference is refused
 * by name, approving with one succeeds, a clarification round-trips without
 * disturbing status, and reviews/meetings can be logged and later updated
 * with a response/outcome.
 *
 * Fields are found by id rather than label text for the client/property
 * selects, the same workaround phase-4.spec.ts documents ("By id, not label
 * text") for this shared, accumulated dev database.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const DIRECTOR = `director6.${tag.toLowerCase()}@ecms.local`;
const OUTSIDER = `outsider6.${tag.toLowerCase()}@ecms.local`;

const banner = (page: Page) => page.locator('div.alert');

async function createUser(page: Page, email: string, name: string, role: string): Promise<void> {
  await page.goto('/users/new');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Role').selectOption(role);
  await page.getByRole('button', { name: 'Create user' }).click();
  await page.waitForURL(/\/users\/[0-9a-f-]{36}$/);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/projects');
}

test.describe.configure({ mode: 'serial' });

let projectId = '';
let submissionId = '';

test.describe('Phase 6 through the browser', () => {
  test('an admin creates a client, property, project, and a submission', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 6 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 6 Plot ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#propertyId').selectOption(propertyId);
    await page.locator('#name').fill(`AAA Phase 6 Project ${tag}`);
    await page.locator('#type').selectOption('PLANNING');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    await createUser(page, DIRECTOR, `Director ${tag}`, 'DIRECTOR');
    await createUser(page, OUTSIDER, `Outsider ${tag}`, 'SUPERVISION');

    // Still signed in as ADMIN from the top of this test — creating a user
    // does not change the session, and re-visiting /login while already
    // authenticated redirects straight past the form (see login/page.tsx).
    await page.goto(`/projects/${projectId}/planning`);
    await page.locator('#reference').fill(`SUB-${tag}`);
    await page.locator('#authorityName').fill('Ministry of Housing');
    await page.locator('#department').selectOption('HOUSING');
    await page.locator('#pendingWith').fill('Client');
    await page.getByRole('button', { name: 'Add submission' }).click();

    const row = page.getByRole('row', { name: new RegExp(`SUB-${tag}`) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Housing', { exact: true })).toBeVisible();
    await row.getByRole('link', { name: `SUB-${tag}` }).click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]{36}$/);
    submissionId = page.url().split('/').pop() ?? '';
  });

  test('a submission halts, resumes, and requests/responds to a clarification', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/planning/submissions/${submissionId}`);

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByText('Under review', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Request clarification' }).click();
    await expect(page.getByText('Clarification pending')).toHaveCount(0); // that badge is on the list page, not here
    await expect(page.getByText(/Requested/)).toBeVisible();

    await page.locator('#response').fill('Site plan attached, please proceed.');
    await page.getByRole('button', { name: 'Record response' }).first().click();
    // The status text alone wouldn't prove the page re-rendered with a fresh
    // `version` — clarification never changes status — so wait for the one
    // thing that does change: the card reverting to "Request clarification"
    // now that the request has been answered. Without this, the next click
    // (Halt) carries a version already stale by two increments.
    await expect(page.getByRole('button', { name: 'Request clarification' })).toBeVisible();

    await page.getByRole('button', { name: 'Halt' }).click();
    await expect(page.getByText('Halted', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByText('Under review', { exact: true }).first()).toBeVisible();
  });

  test('approving without a permit reference is refused; with one, it succeeds', async ({
    page,
  }) => {
    await signIn(page, DIRECTOR);
    await page.goto(`/projects/${projectId}/planning/submissions/${submissionId}`);

    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(banner(page)).toContainText('permit reference');

    await page.locator('#permitReference').fill(`MOH-${tag}`);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`MOH-${tag}`)).toBeVisible();
  });

  test('reviews and meetings are logged and later given a response/outcome', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/planning/submissions/${submissionId}`);

    await page.locator('#reviewDate').fill('2026-09-01');
    await page.locator('#reviewerName').fill('Eng. Salim');
    await page.locator('#comments').fill('Missing setback dimensions');
    await page.getByRole('button', { name: 'Log review' }).click();
    await expect(page.getByText('Missing setback dimensions')).toBeVisible();

    await page.locator('#responseText').fill('Setback dimensions added');
    await page.getByRole('button', { name: 'Record response' }).first().click();
    await expect(page.getByText('Setback dimensions added')).toBeVisible();

    await page.locator('#purpose').fill('Discuss setback objection');
    await page.getByRole('button', { name: 'Log meeting' }).click();
    await expect(page.getByText('Discuss setback objection')).toBeVisible();

    await page.locator('#outcome').fill('Resolved, no further action');
    await page.getByRole('button', { name: 'Record outcome' }).click();
    await expect(page.getByText('Resolved, no further action')).toBeVisible();
  });

  test("THE CRITICAL TEST: a non-member gets nothing for this project's planning", async ({
    page,
  }) => {
    await signIn(page, OUTSIDER);

    const planning = await page.goto(`/projects/${projectId}/planning`);
    expect(planning?.status()).toBeGreaterThanOrEqual(400);

    const submission = await page.goto(
      `/projects/${projectId}/planning/submissions/${submissionId}`,
    );
    expect(submission?.status()).toBeGreaterThanOrEqual(400);
  });

  test('no banner from an unexpected refusal appeared along the way', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/planning`);
    await expect(banner(page)).toHaveCount(0);
    await page.goto(`/projects/${projectId}/planning/submissions/${submissionId}`);
    await expect(banner(page)).toHaveCount(0);
  });
});
