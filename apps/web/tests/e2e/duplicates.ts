import { expect, type Page } from '@playwright/test';

/**
 * Clicks a Create button on a client or property form and waits for the new
 * record's page.
 *
 * The suite runs against a database earlier runs have already written to, so
 * a name like "AAA Phase 4 Client <tag>" is often similar enough to last
 * run's to raise the "possible duplicate" warning. That warning is dismissed
 * here, as a person would. An EXACT match is not: it means the test's own
 * identifiers are not unique, and the test should fail and say so.
 */
export async function submitCreate(page: Page, button: string, detail: RegExp): Promise<void> {
  await page.getByRole('button', { name: button }).click();

  const heading = page.locator('#duplicate-heading');
  await Promise.race([page.waitForURL(detail), heading.waitFor()]);

  if (await heading.isVisible()) {
    await expect(heading, 'test data collided with an existing identity').toHaveText(
      'Possible duplicate found',
    );
    await page.getByRole('button', { name: /create anyway/i }).click();
    await page.waitForURL(detail);
  }
}
