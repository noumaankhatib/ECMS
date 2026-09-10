import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 4's definition of done, performed through the browser
 * (docs/phase-4-plan.md §9): a property records its Oman land-registry
 * identity, and a project left with no code gets one generated from the
 * series matching its type.
 *
 * Fields are found by id rather than label text throughout, the same
 * workaround phase-2.spec.ts already uses ("By id, not label text") — after
 * `selectOption` against a `<select>` carrying the accumulated dev
 * database's full client/property list, `getByLabel` becomes unreliable in
 * this environment. Not a Phase 4 defect: the same happens on the
 * unmodified Phase 1-3 pages once the dev database grows past a couple of
 * hundred rows, which it now has.
 *
 * Names are prefixed "AAA" so they sort first under the client/property
 * lists' `orderBy: { name: 'asc' }` and land inside the pre-existing,
 * documented pageSize:100 cap (docs/PROGRESS.md's "known limit" from steps 8
 * and 12) regardless of how much test data this shared environment has
 * already accumulated — a workaround for that limit, not a fix for it.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ADMIN);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/projects');
}

test.describe('Phase 4 through the browser', () => {
  test('a property records its land-registry identity', async ({ page }) => {
    await signIn(page);

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 4 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 4 Plot ${tag}`);
    await page.locator('#plotNumber').fill('102/8');
    await page.locator('#wilayat').fill('Al Seeb');
    await page.locator('#village').fill('Al Mawaleh South');
    await page.locator('#surveyReference').fill('1-35-055-01-585');
    await page.locator('#titleDeedReference').fill('2015/19618');
    await page.locator('#ownerName').fill('Nasreen bint Abdul Rahim bin Sheikh');
    await page.locator('#ownerNationalId').fill('62898538');
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);

    await expect(page.getByText('102/8')).toBeVisible();
    await expect(page.getByText('Al Seeb / Al Mawaleh South')).toBeVisible();
    await expect(page.getByText('1-35-055-01-585')).toBeVisible();
    await expect(page.getByText('2015/19618')).toBeVisible();
    await expect(page.getByText(/Nasreen bint Abdul Rahim bin Sheikh.*62898538/)).toBeVisible();
  });

  test('a project left with no code gets one generated for its type', async ({ page }) => {
    await signIn(page);

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 4 Numbering Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 4 Numbering Plot ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#propertyId').selectOption(propertyId);
    // Project code left blank on purpose.
    await page.locator('#name').fill(`AAA Phase 4 Supervision Project ${tag}`);
    await page.locator('#type').selectOption('SUPERVISION');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);

    const year = String(new Date().getUTCFullYear() % 100).padStart(2, '0');
    await expect(page.getByText(new RegExp(`^${year}\\.S\\.\\d{3,}$`)).first()).toBeVisible();
  });
});
