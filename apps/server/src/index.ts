import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { prisma } from "./plugins/prisma.js";
import { createShutdownHandler } from "./serverLifecycle.js";

const env = loadEnv();
const app = await buildApp({ env });

await app.listen({
  port: env.PORT,
  host: "::"
});

const shutdown = createShutdownHandler({
  close: () => app.close(),
  disconnect: () => prisma.$disconnect(),
  reportFailure: (message) => {
    app.log.error(message);
    process.exitCode = 1;
  }
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdown();
  });
}
