/**
 * Creates or updates a user from the command line.
 *
 *   node dist/tools/create-user.js <email> <displayName> <password> [roleCode]
 *
 * Exists so the very first administrator can be created without a chicken-and-egg
 * problem, and so a locked-out account can be recovered. Safe to run twice: an
 * existing address has its name and password updated rather than erroring.
 *
 * Interim measure. Once user administration exists in the interface (step 4)
 * this stays only as a break-glass recovery tool.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const [email, displayName, password, roleCode = 'SYSTEM_ADMINISTRATOR'] = process.argv.slice(2);

  if (!email || !displayName || !password) {
    console.error('Usage: create-user <email> <displayName> <password> [roleCode]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Refusing: the password must be at least 12 characters.');
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasourceUrl: process.env['DATABASE_URL'] as string });
  const normalised = email.trim().toLowerCase();
  const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  const user = await prisma.user.upsert({
    where: { email: normalised },
    create: { email: normalised, displayName, passwordHash, status: 'ACTIVE' },
    update: { displayName, passwordHash, status: 'ACTIVE', deletedAt: null },
  });

  await prisma.userRole.upsert({
    where: { userId_roleCode: { userId: user.id, roleCode } },
    create: { userId: user.id, roleCode },
    update: {},
  });

  // The password is never echoed, not even here.
  console.log(`User ready: ${user.email} (${user.id}) with role ${roleCode}`);
  await prisma.$disconnect();
}

void main();
