import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2's definition of done, performed through the browser
 * (docs/phase-2-plan.md §8): a Planning Team member can create an activity, a
 * milestone and a submission; a Supervision Team member can log a site visit
 * with an observation and an instruction; an issue can be raised, moves
 * through its full lifecycle, and a non-member gets nothing.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';

const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const OUTSIDER = `outsider2.${tag.toLowerCase()}@ecms.local`;

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

test.describe('Phase 2 through the browser', () => {
  test('an admin creates a client, property and project of type BOTH', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/clients/new');
    await page.getByLabel('Name').fill(`Phase 2 Client ${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    const clientId = page.url().split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.getByLabel('Client').selectOption(clientId);
    await page.getByLabel('Name').fill(`Phase 2 House ${tag}`);
    await page.getByRole('button', { name: 'Create property' }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    const propertyId = page.url().split('/').pop() ?? '';

    await page.goto('/projects/new');
    await page.getByLabel('Client').selectOption(clientId);
    await page.getByLabel('Property').selectOption(propertyId);
    await page.getByLabel('Project code').fill(`P2-${tag}`);
    await page.getByLabel('Name').fill(`Phase 2 Project ${tag}`);
    await page.getByLabel('Type').selectOption('BOTH');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    await expect(page.getByRole('link', { name: 'Planning' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Supervision' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Issues' })).toBeVisible();

    await createUser(page, OUTSIDER, `Outsider ${tag}`, 'SUPERVISION');
  });

  test('an activity, a milestone and a submission can be created and moved', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/planning`);

    // By id, not label text: the activity and milestone forms both have a
    // field labelled "Name", so the label text alone does not pick one out.
    await page.locator('#name').fill('Draft the brief');
    await page.getByRole('button', { name: 'Add activity' }).click();
    await expect(page.getByRole('cell', { name: 'Draft the brief' })).toBeVisible();
    await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();

    await page
      .getByRole('row', { name: /Draft the brief/ })
      .getByRole('button', { name: 'Mark done' })
      .click();
    await expect(
      page.getByRole('row', { name: /Draft the brief/ }).getByText('Done'),
    ).toBeVisible();

    await page.locator('#milestoneName').fill('Planning submitted');
    await page.getByRole('button', { name: 'Add milestone' }).click();
    await expect(page.getByRole('cell', { name: 'Planning submitted' })).toBeVisible();
    await expect(page.getByText('Not yet').first()).toBeVisible();

    await page
      .getByRole('row', { name: /Planning submitted/ })
      .getByRole('button', { name: 'Mark reached' })
      .click();
    await expect(
      page.getByRole('row', { name: /Planning submitted/ }).getByText('Not yet'),
    ).toHaveCount(0);

    await page.getByLabel('Reference').fill('SUB-001');
    await page.getByLabel('Authority').fill('Local Planning Authority');
    await page.getByRole('button', { name: 'Add submission' }).click();
    await expect(page.getByRole('cell', { name: 'SUB-001' })).toBeVisible();
    await expect(page.getByRole('row', { name: /SUB-001/ }).getByText('Draft')).toBeVisible();

    await page
      .getByRole('row', { name: /SUB-001/ })
      .getByRole('button', { name: 'Submit' })
      .click();
    await expect(page.getByRole('row', { name: /SUB-001/ }).getByText('Submitted')).toBeVisible();
  });

  test('a site visit, an observation and an instruction can be recorded', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/supervision`);

    await page.getByLabel('Visit date').fill('2026-06-01');
    await page.getByLabel('Attendees').fill('Ada, Sam');
    await page.getByRole('button', { name: 'Record site visit' }).click();
    await page.waitForURL(/\/supervision\/[0-9a-f-]{36}$/);

    await page.getByLabel('Description').fill('Crack in the north wall');
    await page.getByRole('button', { name: 'Record observation' }).click();
    await expect(page.getByText('Crack in the north wall')).toBeVisible();

    await page.getByLabel('Directive').fill('Prop the beam before next visit');
    await page.getByRole('button', { name: 'Issue instruction' }).click();
    await expect(page.getByText('Prop the beam before next visit')).toBeVisible();
    await expect(page.getByText('Not yet')).toBeVisible();

    await page.getByRole('button', { name: 'Mark actioned' }).click();
    await expect(page.getByText('Not yet')).toHaveCount(0);
  });

  test('an issue is raised from an observation and walks its full lifecycle', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/supervision`);
    await page.getByRole('link', { name: '1 Jun 2026' }).click();

    await page.getByRole('link', { name: 'Raise issue' }).click();
    await expect(page.getByText('Raised from a recorded observation.')).toBeVisible();

    await page.getByLabel('Title').fill('Structural crack');
    await page.getByLabel('Severity').selectOption('HIGH');
    await page.getByRole('button', { name: 'Raise issue' }).click();
    await page.waitForURL(/\/issues\/[0-9a-f-]{36}$/);

    await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Start work' }).click();
    await expect(page.getByText('In progress').first()).toBeVisible();

    await page.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(page.getByText('Resolved').first()).toBeVisible();

    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Closed').first()).toBeVisible();

    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();

    await page.goto(`/projects/${projectId}/issues`);
    await expect(page.getByRole('link', { name: 'Structural crack' })).toBeVisible();
  });

  test('THE CRITICAL TEST: a non-member gets nothing for Phase 2 records either', async ({
    page,
  }) => {
    await signIn(page, OUTSIDER);

    const planning = await page.goto(`/projects/${projectId}/planning`);
    expect(planning?.status()).toBeGreaterThanOrEqual(400);

    const supervision = await page.goto(`/projects/${projectId}/supervision`);
    expect(supervision?.status()).toBeGreaterThanOrEqual(400);

    const issues = await page.goto(`/projects/${projectId}/issues`);
    expect(issues?.status()).toBeGreaterThanOrEqual(400);
  });

  test('no banner from an unexpected refusal appeared along the way', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}/planning`);
    await expect(banner(page)).toHaveCount(0);
  });
});
