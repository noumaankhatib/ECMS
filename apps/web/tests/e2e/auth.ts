import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { BrowserContextOptions, Page } from '@playwright/test';

/**
 * Signs in once per account and reuses the session afterwards.
 *
 * The API allows 30 sign-in attempts per IP in 15 minutes, and a suite that
 * signs in at the start of every test passes that long before it finishes.
 * A saved session is tried first; if the server no longer honours it (the
 * database was reset, or the test signed out) the page is sent to /login and
 * a real sign-in follows, so a stale file can only cost one extra login.
 */
// Playwright runs from apps/web, so this resolves the same way for every spec.
const CACHE_DIR = path.join(process.cwd(), 'tests', 'e2e', '.auth');

type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

function cacheFile(email: string): string {
  return path.join(CACHE_DIR, `${email.replace(/[^a-z0-9]+/gi, '_')}.json`);
}

function readCached(email: string): StorageState | null {
  try {
    return JSON.parse(readFileSync(cacheFile(email), 'utf8')) as StorageState;
  } catch {
    return null;
  }
}

export async function signInAs(page: Page, email: string, password: string): Promise<void> {
  const cached = readCached(email);
  if (cached) {
    await page.context().addCookies(cached.cookies);
    await page.goto('/dashboard');
    if (!page.url().includes('/login')) return;
    await page.context().clearCookies();
  }

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile(email), JSON.stringify(await page.context().storageState()));
}
