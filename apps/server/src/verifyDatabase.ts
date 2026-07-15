import { verifyDatabase } from "./databaseVerifier.js";
import { prisma } from "./plugins/prisma.js";

try {
  const result = await verifyDatabase(prisma);
  console.log(JSON.stringify(result));
  if (!result.ok) {
    process.exitCode = 1;
  }
} catch {
  console.error(JSON.stringify({ ok: false, error: "database_verification_failed" }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
