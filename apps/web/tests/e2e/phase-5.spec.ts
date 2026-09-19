import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 5's definition of done, performed through the browser
 * (docs/phase-5-plan.md §9): a proposal can be logged with just a contact
 * name and phone and gets a real sketch number immediately; every status
 * change goes through a named transition, not a bare status write; a WON
 * proposal with a property attached converts to a real numbered project in
 * one step, and links to it from the detail page.
 *
 * Fields are found by id rather than label text, the same workaround
 * phase-4.spec.ts documents ("By id, not label text") — `selectOption`
 * against a `<select>` carrying this shared dev database's full
 * client/property list makes `getByLabel` unreliable here.
 *
 * Names are prefixed "AAA" so they sort first under the pageSize:100 cap
 * documented since step 8/12, regardless of how much test data this shared
 * environment has already accumulated.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(ADMIN);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/projects');
}

test.describe('Phase 5 through the browser', () => {
  test('a proposal is logged with just a contact and gets a sketch number', async ({ page }) => {
    await signIn(page);

    await page.goto('/proposals/new');
    await page.locator('#contactName').fill(`AAA Phase 5 Contact ${tag}`);
    await page.locator('#contactPhone').fill('+968 9123 4567');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/proposals\/[0-9a-f-]{36}$/);

    await expect(page.getByText(/^26-SB-\d+$/).first()).toBeVisible();
    await expect(page.getByText('Not attached').first()).toBeVisible();
  });

  test('a WON proposal with a property converts to a numbered project', async ({ page }) => {
    await signIn(page);

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 5 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 5 Plot ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/proposals/new');
    await page.locator('#contactName').fill(`AAA Phase 5 Convert ${tag}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#propertyId').selectOption(propertyId);
    await page.locator('#projectType').selectOption('SUPERVISION');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/proposals\/[0-9a-f-]{36}$/);

    // Walk the status machine to WON through its named transitions — no
    // status field is ever set directly.
    await page.getByRole('button', { name: 'Move to concept' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Send for client review' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Mark won' }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Won')).toBeVisible();

    await page.getByRole('button', { name: 'Convert to project' }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Converted')).toBeVisible();
    await expect(page.getByText('Converted project')).toBeVisible();

    const year = String(new Date().getUTCFullYear() % 100).padStart(2, '0');
    await expect(page.getByText(new RegExp(`^${year}\\.S\\.\\d{3,}$`)).first()).toBeVisible();
  });

  test('converting is refused, by name, when no property is attached', async ({ page }) => {
    await signIn(page);

    await page.goto('/proposals/new');
    await page.locator('#contactName').fill(`AAA Phase 5 No Property ${tag}`);
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/proposals\/[0-9a-f-]{36}$/);

    await page.getByRole('button', { name: 'Move to concept' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Send for client review' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Mark won' }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Convert to project' }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Attach a property to this proposal before converting it.'),
    ).toBeVisible();
  });
});
