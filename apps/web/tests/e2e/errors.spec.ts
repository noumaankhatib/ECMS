import { expect, test } from '@playwright/test';

import { signInAs } from './auth';
import { submitCreate } from './duplicates';
import { pickEntity } from './pickers';

/**
 * How the application tells a person that something was refused.
 *
 * A refusal must name the field and say what to change, must not wipe what was
 * typed, and — for a button rather than a form — must be shown on the page
 * instead of throwing to the generic error screen.
 */

const ADMIN = process.env['E2E_ADMIN_EMAIL'] ?? 'ada@ecms.local';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'correct-horse-battery';
const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

test.describe('Errors tell the person what to fix', () => {
  test('a refused form names the field, keeps what was typed and focuses the message', async ({
    page,
  }) => {
    await signInAs(page, ADMIN, PASSWORD);
    await page.goto('/users/new');

    await page.getByLabel('Full name').fill(`Short Password ${tag}`);
    await page.getByLabel('Username').fill(`shortpw.${tag.toLowerCase()}`);
    await page.getByLabel('Password').fill('abc123');
    await page.getByLabel('Role').selectOption('PLANNING');
    await page.getByRole('button', { name: 'Create user' }).click();

    const banner = page.locator('div.alert[role="alert"]');
    await expect(banner).toContainText('One detail needs fixing before this can be saved');
    await expect(banner).toContainText('Password');
    await expect(banner).toContainText('Use at least 12 characters');
    // Not the old line that claimed fields were highlighted.
    await expect(banner).not.toContainText('highlighted');

    // The message is under the box it is about, and that box is marked.
    await expect(page.locator('#password-error')).toContainText('at least 12 characters');
    await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true');

    // Nothing the person typed was thrown away.
    await expect(page.getByLabel('Full name')).toHaveValue(`Short Password ${tag}`);
    await expect(page.getByLabel('Username')).toHaveValue(`shortpw.${tag.toLowerCase()}`);

    // Focus moved to the message, so it is read out and in view.
    await expect(banner).toBeFocused();

    // The field name in the banner takes the person to the box.
    await banner.getByRole('button', { name: 'Password' }).click();
    await expect(page.locator('#password')).toBeFocused();
  });

  test('a successful add form still clears, ready for the next one', async ({ page }) => {
    await signInAs(page, ADMIN, PASSWORD);
    await page.goto('/sketch-types');
    const label = `Clears ${tag}`;
    const add = page.locator('form', {
      has: page.getByRole('button', { name: 'Add', exact: true }),
    });
    await add.getByLabel('Code').fill(`CLR${tag}`);
    await add.getByLabel('Label').fill(label);
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    // A refusal keeps what was typed (tested above); a success empties the form.
    await expect(add.getByLabel('Label')).toHaveValue('');
    await expect(add.getByLabel('Code')).toHaveValue('');
    await expect(add.locator('div.alert')).toHaveCount(0);
    // And the new type really was saved: it is now one of the editable rows.
    await page.reload();
    await expect(page.locator(`input[value="${label}"]`)).toHaveCount(1);
  });

  test('a refused button explains why on the page instead of the error screen', async ({
    page,
  }) => {
    await signInAs(page, ADMIN, PASSWORD);

    await page.goto('/clients/new');
    await page.getByLabel('First name').fill(`Archive Block ${tag}`);
    await submitCreate(page, 'Create client', /\/clients\/[0-9a-f-]{36}$/);
    const clientUrl = page.url();
    const clientId = clientUrl.split('/').pop() ?? '';

    await page.goto(`/properties/new?clientId=${clientId}`);
    await pickEntity(page, 'clientId', tag);
    await page.locator('#name').fill(`Archive Block House ${tag}`);
    await submitCreate(page, 'Create property', /\/properties\/[0-9a-f-]{36}$/);

    await page.goto(clientUrl);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Archive' }).click();

    const refusal = page.locator('.action-button__error');
    await expect(refusal).toContainText('cannot be done while other records still depend on it');
    await expect(refusal).toContainText('still attached to this client');
    // The page is still the client, not the generic failure screen.
    await expect(page).toHaveURL(clientUrl);
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  });
});
