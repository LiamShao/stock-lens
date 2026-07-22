import { PrismaService } from './database/prisma.service';
import { getDemoUserConfig } from './auth/demo-user.config';
import { toDemoUserCliError } from './auth/demo-user-error';
import { DemoUserProvisioner } from './auth/demo-user-provisioner';
import { PasswordHasher } from './auth/password-hasher';
import { loadLocalEnvironment } from './environment';

async function provisionDemoUser(): Promise<void> {
  loadLocalEnvironment();
  const config = getDemoUserConfig();
  const prisma = new PrismaService();

  try {
    await prisma.$connect();
    const provisioner = new DemoUserProvisioner(prisma, new PasswordHasher());
    const result = await provisioner.provision(config);
    process.stdout.write(
      `${JSON.stringify({
        action: result.action,
        email: result.user.email,
        event: 'demo_user_provisioned',
        userId: result.user.id,
      })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void provisionDemoUser().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify(toDemoUserCliError(error))}\n`);
  process.exitCode = 1;
});
