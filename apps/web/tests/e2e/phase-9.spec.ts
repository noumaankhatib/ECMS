import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 9's definition of done, performed through the browser
 * (docs/phase-9-plan.md §8): an administrator adds a required-document
 * category, a fresh project shows it missing, uploading a document under a
 * matching category satisfies it, and someone without
 * `required_document:admin` cannot reach the admin page at all.
 *
 * The required-documents catalogue is global and shared across every e2e
 * run against this dev database, so this test never asserts an exact
 * missing count — only on its own uniquely tagged category, the same
 * workaround phase-4.spec.ts documents for other accumulated, shared state.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const OUTSIDER = `outsider9.${tag.toLowerCase()}@ecms.local`;
const CATEGORY = `Phase9Category${tag}`;

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
const fixtureDir = mkdtempSync(join(tmpdir(), 'ecms-e2e-'));
const fixturePath = join(fixtureDir, 'phase-9-fixture.txt');
writeFileSync(fixturePath, `Phase 9 e2e fixture ${tag}\n`);

test.describe('Phase 9 through the browser', () => {
  test('an admin adds a required document, and creates a project', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/required-documents');
    // Every row's own edit form has a field also labelled "Label", so the
    // Add form's own fields are found by id, not label text — the same
    // workaround phase-1.spec.ts documents for ambiguous selects.
    await page.locator('#category').fill(CATEGORY);
    await page.locator('#label').fill(`Phase 9 requirement ${tag}`);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(CATEGORY)).toBeVisible();

    await page.goto('/clients/new');
    await page.locator('#name').fill(`AAA Phase 9 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#name').fill(`AAA Phase 9 Plot ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.locator('#clientId').selectOption(clientId);
    await page.locator('#propertyId').selectOption(propertyId);
    await page.locator('#name').fill(`AAA Phase 9 Project ${tag}`);
    await page.locator('#type').selectOption('PLANNING');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    await createUser(page, OUTSIDER, `Outsider ${tag}`, 'PLANNING');
  });

  test('the project shows the new requirement missing, then satisfied after upload', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/documents`);

    await expect(page.getByText(`✗ Phase 9 requirement ${tag}`)).toBeVisible();

    await page.getByLabel('Category').fill(CATEGORY);
    await page.getByLabel('Title').fill('Matching upload');
    await page.setInputFiles('#file', fixturePath);
    await page.getByRole('button', { name: 'Upload document' }).click();
    await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/);

    await page.goto(`/projects/${projectId}/documents`);
    await expect(page.getByText(`✓ Phase 9 requirement ${tag}`)).toBeVisible();
  });

  test("THE CRITICAL TEST: someone without required_document:admin can't reach the admin page", async ({
    page,
  }) => {
    await signIn(page, OUTSIDER);
    await page.goto('/required-documents');
    expect(page.url()).not.toContain('/required-documents');
  });

  test('no banner from an unexpected refusal appeared along the way', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto('/required-documents');
    await expect(page.locator('div.alert')).toHaveCount(0);
    await page.goto(`/projects/${projectId}/documents`);
    await expect(page.locator('div.alert')).toHaveCount(0);
  });
});
