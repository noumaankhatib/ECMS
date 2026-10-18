import { expect, type Page } from '@playwright/test';

/**
 * Chooses a record in a type-ahead field (the client, property and person
 * pickers are search boxes, not dropdowns): types a term unique to the record,
 * waits for the list, and takes the first match.
 */
export async function pickEntity(page: Page, field: string, term: string): Promise<void> {
  await page.locator(`#${field}-search`).fill(term);
  const first = page.locator('[role="listbox"] [role="option"] button').first();
  await expect(first, `no "${term}" in the ${field} list`).toBeVisible();
  await first.click();
}

/** Fills a day/month/year date field from an ISO date (yyyy-mm-dd). */
export async function fillDate(page: Page, name: string, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-');
  const field = page.locator(`.date-field:has(#${name}-day)`);
  await field.getByLabel('Day').fill(day ?? '');
  await field.getByLabel('Month').fill(month ?? '');
  await field.getByLabel('Year').fill(year ?? '');
}

/** Chooses a document category, or types a new one under "Other…". */
export async function chooseCategory(page: Page, category: string): Promise<void> {
  const select = page.getByLabel('Category');
  const known = await select.locator(`option[value="${category}"]`).count();
  if (known > 0) {
    await select.selectOption(category);
    return;
  }
  await select.selectOption({ label: 'Other…' });
  await page.getByPlaceholder('Type the category').fill(category);
}
