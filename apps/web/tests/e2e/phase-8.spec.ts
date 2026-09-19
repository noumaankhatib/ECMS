import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 8's definition of done, performed through the browser
 * (docs/phase-8-plan.md §9): a client-requested modification can be
 * recorded against a project, and moves through the shared `ApprovalStatus`
 * machine (submit, review, approve) the same way a drawing revision does.
 *
 * Fields are found by id rather than label text for the client/property
 * selects, the same workaround phase-4.spec.ts documents for this shared,
 * accumulated dev database.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const OUTSIDER = `outsider8.${tag.toLowerCase()}@ecms.local`;

async function createUser(page: Page, email: string, name: string, role: string): Promise<void> {
  await page.goto('/users/new');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Username').fill(email.split('@')[0] ?? email);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Role').selectOption(role);
  await page.getByRole('button', { name: 'Create user' }).click();
  await page.waitForURL(/\/users\/[0-9a-f-]{36}$/);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/projects');
}

test.describe.configure({ mode: 'serial' });

let projectId = '';

test.describe('Phase 8 through the browser', () => {
  test('an admin creates a client, property, and a BOTH-type project', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 8 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 8 Plot ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#propertyId').selectOption(propertyId);
    await page.locator('#name').fill(`AAA Phase 8 Project ${tag}`);
    await page.locator('#type').selectOption('BOTH');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    await createUser(page, OUTSIDER, `Outsider ${tag}`, 'PLANNING');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('link', { name: 'Modifications' })).toBeVisible();
  });

  test('a modification is recorded against the project', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/modifications`);

    await expect(page.getByText('No modifications recorded yet')).toBeVisible();

    await page.locator('#impactArea').selectOption('ARCHITECTURE');
    await page.locator('#costImpact').fill('+OMR 1,200');
    await page.locator('#timeImpact').fill('+1 week');
    await page.locator('#requestText').fill('Move the kitchen wall by one metre');
    await page.getByRole('button', { name: 'Record modification' }).click();

    await expect(page.getByText('Move the kitchen wall by one metre')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Draft' })).toBeVisible();
  });

  test('the modification moves through submit, review and approve', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/modifications`);

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('cell', { name: 'Submitted' })).toBeVisible();

    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByRole('cell', { name: 'Under review' })).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('cell', { name: 'Approved' })).toBeVisible();
  });

  test("THE CRITICAL TEST: a non-member gets nothing for this project's modifications", async ({
    page,
  }) => {
    await signIn(page, OUTSIDER);

    const modifications = await page.goto(`/projects/${projectId}/modifications`);
    expect(modifications?.status()).toBeGreaterThanOrEqual(400);
  });

  test('no banner from an unexpected refusal appeared along the way', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/modifications`);
    await expect(page.locator('div.alert')).toHaveCount(0);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator('div.alert')).toHaveCount(0);
  });
});
