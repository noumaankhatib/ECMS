import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 3's definition of done, performed through the browser
 * (docs/phase-3-plan.md §11): a drawing is registered, a revision is
 * uploaded and walks its approval lifecycle, a document is registered,
 * uploaded and downloaded back byte-for-byte, and a non-member gets nothing
 * for either.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const OUTSIDER = `outsider3.${tag.toLowerCase()}@ecms.local`;

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
const fixtureDir = mkdtempSync(join(tmpdir(), 'ecms-e2e-'));
const fixturePath = join(fixtureDir, 'site-report.txt');
writeFileSync(fixturePath, `Phase 3 e2e fixture ${tag}\n`);

test.describe('Phase 3 through the browser', () => {
  test('an admin creates a client, property and project', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/clients/new');
    await page.getByLabel('Name').fill(`Phase 3 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.getByLabel('Client').selectOption(clientId);
    await page.getByLabel('Name', { exact: true }).fill(`Phase 3 House ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.getByLabel('Client').selectOption(clientId);
    await page.getByLabel('Property').selectOption(propertyId);
    await page.getByLabel('Project code').fill(`P3-${tag}`);
    await page.getByLabel('Name').fill(`Phase 3 Project ${tag}`);
    await page.getByLabel('Type').selectOption('BOTH');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    await expect(page.getByRole('link', { name: 'Drawings' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Documents' })).toBeVisible();

    await createUser(page, OUTSIDER, `Outsider ${tag}`, 'SUPERVISION');
  });

  test('a drawing is registered, a revision is uploaded, and walks to Approved', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/drawings`);

    await page.getByLabel('Drawing number').fill('A-101');
    await page.getByLabel('Title').fill('Ground floor plan');
    await page.getByRole('button', { name: 'Register drawing' }).click();
    await page.waitForURL(/\/drawings\/[0-9a-f-]{36}$/);

    await page.getByLabel('Revision code').fill('P1');
    await page.getByRole('button', { name: 'Upload revision' }).click();
    const row = page.getByRole('row', { name: /P1/ });
    await expect(page.getByRole('cell', { name: 'P1' })).toBeVisible();
    await expect(row.getByText('Current', { exact: true })).toBeVisible();
    await expect(row.getByText('Draft', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Submit' }).click();
    await expect(row.getByText('Submitted', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Start review' }).click();
    await expect(row.getByText('Under review', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row.getByText('Approved', { exact: true })).toBeVisible();
  });

  test('a second revision supersedes the first', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/drawings`);
    await page.getByRole('link', { name: 'A-101' }).click();

    await page.getByLabel('Revision code').fill('P2');
    await page.getByRole('button', { name: 'Upload revision' }).click();

    await expect(page.getByRole('row', { name: /P1/ }).getByText('Superseded')).toBeVisible();
    await expect(page.getByRole('row', { name: /P2/ }).getByText('Current')).toBeVisible();
  });

  test('a document is registered, uploaded, and downloaded back byte-for-byte', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/documents`);

    await page.getByLabel('Category').fill('Report');
    await page.getByLabel('Title').fill('Site inspection report');
    await page.setInputFiles('#file', fixturePath);
    await page.getByRole('button', { name: 'Upload document' }).click();
    await page.waitForURL(/\/documents\/[0-9a-f-]{36}$/);

    await expect(page.getByText('Available', { exact: true }).first()).toBeVisible();

    const downloadLink = page.getByRole('link', { name: 'site-report.txt' });
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.getAttribute('href');
    const response = await page.request.get(href ?? '');
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toBe(`Phase 3 e2e fixture ${tag}\n`);
  });

  test('archiving a document hides it from the list', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/documents`);

    page.on('dialog', (dialog) => void dialog.accept());
    await page
      .getByRole('row', { name: /Site inspection report/ })
      .getByRole('button', { name: 'Archive' })
      .click();
    await expect(page.getByRole('cell', { name: 'Site inspection report' })).toHaveCount(0);
  });

  test('THE CRITICAL TEST: a non-member gets nothing for drawings or documents', async ({
    page,
  }) => {
    await signIn(page, OUTSIDER);

    const drawings = await page.goto(`/projects/${projectId}/drawings`);
    expect(drawings?.status()).toBeGreaterThanOrEqual(400);

    const documents = await page.goto(`/projects/${projectId}/documents`);
    expect(documents?.status()).toBeGreaterThanOrEqual(400);
  });

  test('no banner from an unexpected refusal appeared along the way', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/drawings`);
    await expect(banner(page)).toHaveCount(0);
    await page.goto(`/projects/${projectId}/documents`);
    await expect(banner(page)).toHaveCount(0);
  });
});
