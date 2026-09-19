/**
 * Creates or updates a user from the command line.
 *
 *   node dist/tools/create-user.js <username> <displayName> <password> [roleCode] [email]
 *
 * Exists so the very first administrator can be created without a chicken-and-egg
 * problem, and so a locked-out account can be recovered. Safe to run twice: an
 * existing username has its name and password updated rather than erroring.
 *
 * Email is optional here, same as everywhere else — this system sends no mail
 * of any kind, so it is never a required mailbox, only an optional extra
 * identity.
 *
 * Interim measure. Once user administration exists in the interface (step 4)
 * this stays only as a break-glass recovery tool.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const [username, displayName, password, roleCode = 'SYSTEM_ADMINISTRATOR', email] =
    process.argv.slice(2);

  if (!username || !displayName || !password) {
    console.error('Usage: create-user <username> <displayName> <password> [roleCode] [email]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Refusing: the password must be at least 12 characters.');
    process.exit(1);
  }

  const dbHost = process.env['DB_HOST'] ?? 'localhost';
  const dbPort = process.env['DB_PORT'] ?? '5432';
  const dbName = process.env['DB_NAME'] ?? 'ecms';
  const dbUser = process.env['DB_APP_USER'] ?? 'ecms_app';
  const dbPassword = encodeURIComponent(process.env['DB_APP_PASSWORD'] ?? '');
  const prisma = new PrismaClient({ datasourceUrl: `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}` });
  const normalisedUsername = username.trim().toLowerCase();
  const normalisedEmail = email ? email.trim().toLowerCase() : null;
  const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  const user = await prisma.user.upsert({
    where: { username: normalisedUsername },
    create: {
      username: normalisedUsername,
      email: normalisedEmail,
      displayName,
      passwordHash,
      status: 'ACTIVE',
    },
    update: { displayName, passwordHash, status: 'ACTIVE', deletedAt: null },
  });

  await prisma.userRole.upsert({
    where: { userId_roleCode: { userId: user.id, roleCode } },
    create: { userId: user.id, roleCode },
    update: {},
  });

  // The password is never echoed, not even here.
  console.log(`User ready: ${user.username} (${user.id}) with role ${roleCode}`);
  await prisma.$disconnect();
}

void main();
