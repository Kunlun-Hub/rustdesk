import { runHealthChecks } from '../src/services/health.js';
import { prisma } from '../src/prisma.js';

async function main() {
  const result = await runHealthChecks();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    throw new Error('Health check failed');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
