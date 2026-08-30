import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters. These are the OWASP-recommended baseline: 19 MiB of
 * memory, two iterations, one degree of parallelism. Argon2id is used rather
 * than bcrypt because it resists GPU and ASIC attacks far better, and has no
 * silent 72-byte input truncation.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/**
 * A hash of a value nobody will ever submit, computed once at startup.
 *
 * When someone signs in with an email that does not exist, we verify against
 * this instead of returning early. Without it, a missing account answers
 * noticeably faster than a wrong password, and that timing difference is enough
 * to enumerate who holds an account here.
 */
const DECOY_HASH_PROMISE: Promise<string> = hash('decoy-for-constant-time', OPTIONS).catch(
  () => '',
);

@Injectable()
export class PasswordService {
  hash(plaintext: string): Promise<string> {
    return hash(plaintext, OPTIONS);
  }

  /**
   * Verifies a password. Pass `null` when the account was not found: the work
   * is still done, against the decoy, so the response takes the same time.
   */
  async verify(plaintext: string, storedHash: string | null): Promise<boolean> {
    const target = storedHash ?? (await DECOY_HASH_PROMISE);
    if (target === '') return false;

    try {
      const matches = await verify(target, plaintext, OPTIONS);
      // Even a correct password against the decoy is a failure — there is no
      // account behind it.
      return storedHash === null ? false : matches;
    } catch {
      // A malformed stored hash must fail closed, never throw to the caller.
      return false;
    }
  }
}
