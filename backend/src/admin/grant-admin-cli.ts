import { NestFactory } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CLI: `pnpm grant-admin <supabaseUserId>` — bootstrap the first admin.
 * The user must have signed in at least once (so their row exists).
 */
async function main(): Promise<void> {
  const supabaseUserId = process.argv[2];
  if (!supabaseUserId) {
    console.error('Usage: pnpm grant-admin <supabaseUserId>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const user = await prisma.user.findUnique({ where: { supabaseUserId } });
  if (!user) {
    console.error(`No user found for supabaseUserId=${supabaseUserId}. Have them sign in first.`);
    await app.close();
    process.exit(1);
  }
  await prisma.userRoleAssignment.upsert({
    where: { userId_role: { userId: user.id, role: UserRole.admin } },
    update: {},
    create: { userId: user.id, role: UserRole.admin },
  });

  console.log(`Granted admin to user ${user.id} (${supabaseUserId}).`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
