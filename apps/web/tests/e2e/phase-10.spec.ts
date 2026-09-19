import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 10's definition of done, performed through the browser
 * (docs/phase-10-plan.md §8): closing is blocked with a reason while the
 * handover checklist is incomplete, and succeeds once every issue is
 * closed, every applicable required document is uploaded, and every
 * checklist item is ticked.
 *
 * The required-documents catalogue is global and shared across every e2e
 * run against this dev database (phase-9.spec.ts's own note), so this test
 * uploads a matching document for every category currently active rather
 * than a fixed list.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/projects');
}

test.describe.configure({ mode: 'serial' });

let projectId = '';
const fixtureDir = mkdtempSync(join(tmpdir(), 'ecms-e2e-'));
const fixturePath = join(fixtureDir, 'phase-10-fixture.txt');
writeFileSync(fixturePath, `Phase 10 e2e fixture ${tag}\n`);

test.describe('Phase 10 through the browser', () => {
  test('an admin creates and completes a project', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 10 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 10 Plot ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#propertyId').selectOption(propertyId);
    await page.locator('#name').fill(`AAA Phase 10 Project ${tag}`);
    await page.locator('#type').selectOption('PLANNING');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    await page.getByRole('button', { name: 'Activate' }).click();
    await page.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
  });

  test('closing is offered but disabled while the checklist is incomplete', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}`);

    await expect(page.getByText('Handover')).toBeVisible();
    const closeButton = page.getByRole('button', { name: 'Close' });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeDisabled();
    await expect(closeButton).toHaveAttribute('title', /handover checklist/i);
  });

  test('uploading every required document and ticking the checklist unblocks closing', async ({
    page,
  }) => {
    // The required-documents catalogue accumulates across every e2e run
    // against this dev database (phase-9.spec.ts's own note) — this test's
    // own runtime scales with however many categories that catalogue has
    // grown to, not with anything this phase does.
    test.setTimeout(180_000);
    await signIn(page, ADMIN);

    // Every category currently active and applicable to a PLANNING project.
    await page.goto('/required-documents');
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    const categories: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const scope = (await row.locator('td').nth(1).innerText()).trim();
      if (scope === 'Any project' || scope === 'Planning') {
        categories.push((await row.locator('td.mono').innerText()).trim());
      }
    }
    expect(categories.length).toBeGreaterThan(0);

    for (const category of categories) {
      await page.goto(`/projects/${projectId}/documents`);
      await page.getByLabel('Category').fill(category);
      await page.getByLabel('Title').fill(`${category} (phase 10 e2e)`);
      await page.setInputFiles('#file', fixturePath);
      await page.getByRole('button', { name: 'Upload document' }).click();
      await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
    }

    await page.goto(`/projects/${projectId}/documents`);
    await expect(page.getByText('Every required document has been uploaded.')).toBeVisible();

    await page.goto(`/projects/${projectId}`);
    for (const label of [
      'Final inspection done',
      'Authority completion documents received',
      'Mandatory tests received',
      'As-built drawings received',
      'Warranties received',
      'Final report issued',
    ]) {
      const row = page.getByRole('row').filter({ hasText: label });
      await row.getByRole('button', { name: 'Mark done' }).click();
      await expect(
        page.getByRole('row').filter({ hasText: label }).getByText('Not yet'),
      ).toHaveCount(0);
    }

    const closeButton = page.getByRole('button', { name: 'Close' });
    await expect(closeButton).toBeEnabled();

    page.on('dialog', (dialog) => void dialog.accept());
    await closeButton.click();
    await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
  });

  test('no banner from an unexpected refusal appeared along the way', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator('div.alert[role="alert"]')).toHaveCount(0);
  });
});
