import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 7's definition of done, performed through the browser
 * (docs/phase-7-plan.md §9): a Supervision project can record an agreement,
 * the project page shows a quota derived from real site visits (not a
 * stored counter), and renewing produces a second, linked agreement.
 *
 * Fields are found by id rather than label text for the client/property
 * selects, the same workaround phase-4.spec.ts documents for this shared,
 * accumulated dev database.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const OUTSIDER = `outsider7.${tag.toLowerCase()}@ecms.local`;

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

test.describe('Phase 7 through the browser', () => {
  test('an admin creates a client, property, and a supervision project', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 7 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 7 Plot ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#propertyId').selectOption(propertyId);
    await page.locator('#name').fill(`AAA Phase 7 Project ${tag}`);
    await page.locator('#type').selectOption('SUPERVISION');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    await createUser(page, OUTSIDER, `Outsider ${tag}`, 'SUPERVISION');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('No active agreement')).toBeVisible();
  });

  test('an agreement is recorded and its quota shows against a logged visit', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/supervision/agreements`);

    const today = new Date().toISOString().slice(0, 10);
    await page.locator('#type').selectOption('MONTHLY');
    await page.locator('#visitsAllowed').fill('4');
    await page.locator('#amount').fill('500');
    await page.locator('#startDate').fill(today);
    await page.getByRole('button', { name: 'Record agreement' }).click();

    await expect(page.getByRole('cell', { name: 'Monthly' })).toBeVisible();
    await expect(page.getByText('0 / 4')).toBeVisible();

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Visits used')).toBeVisible();
    await expect(page.getByText('0 / 4')).toBeVisible();

    await page.goto(`/projects/${projectId}/supervision`);
    await page.locator('#visitDate').fill(today);
    await page.getByRole('button', { name: 'Record site visit' }).click();
    await page.waitForURL(/\/supervision\/[0-9a-f-]{36}$/);

    await page.goto(`/projects/${projectId}/supervision/agreements`);
    await expect(page.getByText('1 / 4')).toBeVisible();
  });

  test('renewing an agreement produces a second, linked agreement', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/supervision/agreements`);

    await expect(page.getByRole('button', { name: 'Renew' })).toBeVisible();
    await page.locator('#visitsAllowed').last().fill('6');
    await page.locator('#amount').last().fill('750');
    await page.getByRole('button', { name: 'Renew' }).click();

    // The source now shows Renewed, and the table gains a second, Active row
    // for the renewal — the Renew card reappears for that new row, since it
    // is itself not yet renewed (correct: renewing is not a one-time-only
    // feature of the project, only of any single agreement).
    await expect(page.getByRole('cell', { name: 'Renewed' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Active' })).toBeVisible();
    await expect(page.getByText('750')).toBeVisible();
  });

  test("THE CRITICAL TEST: a non-member gets nothing for this project's supervision agreements", async ({
    page,
  }) => {
    await signIn(page, OUTSIDER);

    const agreements = await page.goto(`/projects/${projectId}/supervision/agreements`);
    expect(agreements?.status()).toBeGreaterThanOrEqual(400);
  });

  test('no banner from an unexpected refusal appeared along the way', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/supervision/agreements`);
    await expect(page.locator('div.alert')).toHaveCount(0);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator('div.alert')).toHaveCount(0);
  });
});
