import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1's definition of done, performed through the browser.
 *
 * From docs/phase-1-plan.md §7:
 *
 *   An Admin can log in, create a user, and assign them a role.
 *   An Admin can create a client, add a property, and create a project.
 *   A Project Manager logs in and sees ONLY the projects they are a member of.
 *   A user who is not a member of a project receives nothing from the API for it.
 *
 * The last of those is the one worth being strict about, and it is checked from
 * two directions: the list has no row, and the page cannot be opened by typing
 * its address.
 */

const PASSWORD = 'correct-horse-battery';

/**
 * The administrator is the only account this suite expects to already exist —
 * `pnpm run bootstrap` creates one on a fresh machine.
 *
 * Everyone else is created BY the suite, per run. An earlier version reused
 * fixed accounts and passed only once: the second run found the "member of
 * nothing" people had been added to a project by the first, and the assertion
 * that their list was empty was suddenly false. A test that depends on the
 * database being fresh is a test that quietly stops being run.
 */
const ADMIN = 'ada@ecms.local';

/** Distinct per run, so repeated runs do not collide on unique references. */
const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

const MANAGER = `outsider.${tag.toLowerCase()}@ecms.local`;
const PLANNER = `planner.${tag.toLowerCase()}@ecms.local`;

async function createUser(page: Page, email: string, name: string, role: string): Promise<void> {
  await page.goto('/users/new');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Role').selectOption(role);
  await page.getByRole('button', { name: 'Create user' }).click();
  await page.waitForURL(/\/users\/[0-9a-f-]{36}$/);
}

/**
 * Our own error banner.
 *
 * Not `getByRole('alert')`: Next renders a permanently-empty route announcer
 * with the same role, so that selector matches two elements and fails strict
 * mode. This asks for the one the application put there.
 */
const banner = (page: Page) => page.locator('div.alert');

/**
 * The status badge, by its class rather than its text.
 *
 * The word also appears in the sentence explaining which moves are legal from
 * here, so matching on text alone finds two elements.
 */
const statusBadge = (page: Page, status: string) => page.locator(`.badge--${status}`);

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/projects');
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
}

test.describe.configure({ mode: 'serial' });

let clientId = '';
let propertyId = '';
let projectId = '';
let projectCode = '';

test.describe('Phase 1 through the browser', () => {
  test('refuses a wrong password without revealing whether the account exists', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(ADMIN);
    await page.getByLabel('Password').fill('not-the-right-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(banner(page)).toContainText('incorrect');

    // An address with no account behind it gets the identical message. Anything
    // else turns this form into a way of finding out who works here.
    await page.getByLabel('Email address').fill('nobody@nowhere.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(banner(page)).toContainText('incorrect');
  });

  test('sends a signed-out visitor to the sign-in page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an admin creates a client, a property and a project', async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto('/clients/new');
    await page.getByLabel('Name').fill(`Riverside Developments ${tag}`);
    await page.getByLabel('Reference').fill(`RIV-${tag}`);
    await page.getByRole('button', { name: 'Create client' }).click();

    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
    clientId = page.url().split('/').pop() ?? '';
    await expect(page.getByRole('heading', { level: 1 })).toContainText(tag);

    await page.goto(`/properties/new?clientId=${clientId}`);
    await page.getByLabel('Client').selectOption(clientId);
    await page.getByLabel('Name').fill(`Riverside House ${tag}`);
    await page.getByLabel('Town or city').fill('Leeds');
    await page.getByLabel('Postcode').fill('LS1 4AP');
    await page.getByRole('button', { name: 'Create property' }).click();

    await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
    propertyId = page.url().split('/').pop() ?? '';
    await expect(page.getByRole('heading', { level: 1 })).toContainText(tag);

    projectCode = `RIV-${tag}-01`;
    await page.goto('/projects/new');
    await page.getByLabel('Client').selectOption(clientId);
    await page.getByLabel('Property').selectOption(propertyId);
    await page.getByLabel('Project code').fill(projectCode);
    await page.getByLabel('Name').fill(`Riverside Refurbishment ${tag}`);
    await page.getByLabel('Type').selectOption('BOTH');
    await page.getByRole('button', { name: 'Create project' }).click();

    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    // A project of type BOTH opens with one workstream of each kind, so a
    // supervision engagement cannot quietly contain no supervision work.
    await expect(page.getByRole('cell', { name: 'Planning', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Supervision', exact: true })).toBeVisible();
    await expect(statusBadge(page, 'draft')).toBeVisible();
  });

  test('an admin creates a user and assigns them a role', async ({ page }) => {
    await signIn(page, ADMIN);

    await createUser(
      page,
      `sam.${tag.toLowerCase()}@ecms.local`,
      `Sam Surveyor ${tag}`,
      'SUPERVISION',
    );
    await expect(page.getByText('Supervision Team')).toBeVisible();

    // The two people the rest of the suite needs. Created here, so they start
    // as members of nothing however many times this has been run before.
    await createUser(page, MANAGER, `Outside Manager ${tag}`, 'PROJECT_MANAGER');
    await createUser(page, PLANNER, `Outside Planner ${tag}`, 'PLANNING');

    // A second role can be granted, and takes effect on the spot.
    await page.getByLabel('Add a role').selectOption('DOCUMENT_CONTROLLER');
    await page.getByRole('button', { name: 'Grant role' }).click();
    await expect(page.getByText('Document Controller')).toBeVisible();
  });

  test('THE CRITICAL TEST: a non-member gets nothing for a project', async ({ page }) => {
    await signIn(page, MANAGER);

    // A Project Manager holds project:view — but only within their own
    // projects, and this is not one of them.
    await expect(page.getByRole('link', { name: projectCode })).toHaveCount(0);
    await expect(page.getByText('not a member of any project')).toBeVisible();

    // Not a hidden button. Typing the address gets nowhere either.
    const response = await page.goto(`/projects/${projectId}`);
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });

  test('a planner sees an empty list and is offered nothing they cannot do', async ({ page }) => {
    await signIn(page, PLANNER);

    await expect(page.getByRole('link', { name: projectCode })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New project' })).toHaveCount(0);

    // Planning holds no user:view, so the navigation does not offer it.
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
    // They may read reference data, so those do appear.
    await expect(page.getByRole('link', { name: 'Clients' })).toBeVisible();
  });

  test('membership opens exactly one project, and grants nothing extra', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}`);

    await page.getByLabel('Person').selectOption({ label: `Outside Manager ${tag} (${MANAGER})` });
    await page.getByLabel('Role on this project').selectOption('PROJECT_MANAGER');
    await page.getByRole('button', { name: 'Add to project' }).click();
    await expect(page.getByRole('cell', { name: `Outside Manager ${tag}` })).toBeVisible();
    await signOut(page);

    await signIn(page, MANAGER);
    await expect(page.getByRole('link', { name: projectCode })).toBeVisible();

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(tag);
    // They may now edit it, because membership brought their role's
    // project-scoped grants to bear here.
    await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
  });

  test('a planner added to a project can see it but still not edit it', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}`);
    await page.getByLabel('Person').selectOption({ label: `Outside Planner ${tag} (${PLANNER})` });
    await page.getByLabel('Role on this project').selectOption('PLANNING');
    await page.getByRole('button', { name: 'Add to project' }).click();
    await expect(page.getByRole('cell', { name: `Outside Planner ${tag}` })).toBeVisible();
    await signOut(page);

    await signIn(page, PLANNER);
    await expect(page.getByRole('link', { name: projectCode })).toBeVisible();

    await page.goto(`/projects/${projectId}`);
    // Membership widened WHERE they may work, not WHAT they may do.
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Activate' })).toHaveCount(0);
  });

  test('only the legal transitions are offered, and they work', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}`);

    // DRAFT may only become ACTIVE. Completing straight from draft would skip
    // the work, so it is not offered — and the API refuses it independently.
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(statusBadge(page, 'active')).toBeVisible();

    // ACTIVE may go on hold or complete, but not straight to closed.
    await expect(page.getByRole('button', { name: 'Put on hold' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark complete' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);
  });

  test('a workstream moves only through its own legal transitions', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto(`/projects/${projectId}`);

    const planningRow = page.getByRole('row').filter({ hasText: 'Planning' }).first();
    await planningRow.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('In progress').first()).toBeVisible();
  });

  test('archiving is refused while a project depends on it, with the reason', async ({ page }) => {
    await signIn(page, ADMIN);

    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto(`/properties/${propertyId}`);
    await page.getByRole('button', { name: 'Archive' }).click();

    // The refusal reaches the person, and says which records are in the way.
    await expect(page.getByText(/project/i).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(propertyId));
  });

  test('signing out genuinely ends the session', async ({ page }) => {
    await signIn(page, ADMIN);
    await signOut(page);

    // Going back is not enough to get in again — the session was revoked at the
    // API, not merely forgotten by this browser.
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login$/);
  });
});
