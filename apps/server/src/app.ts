import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadEnv, type AppEnv } from "./env.js";
import { registerAdminStaticRoutes } from "./routes/adminStatic.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { registerGroupDashboardRoutes } from "./routes/groupDashboard.js";
import { registerGroupHistoryRoutes } from "./routes/groupHistory.js";
import { registerGroupOperationsRoutes } from "./routes/groupOperations.js";
import { registerGroupKnowledgeRoutes } from "./routes/groupKnowledge.js";
import { registerGroupParticipationRoutes } from "./routes/groupParticipation.js";
import { registerGroupRoutes } from "./routes/groups.js";
import { registerGroupTodayRoutes } from "./routes/groupToday.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRecommendationAdminRoutes } from "./routes/recommendations-admin.js";
import { registerRecommendationRoutes } from "./routes/recommendations.js";
import { registerRestaurantRoutes } from "./routes/restaurants.js";
import { registerSessionRoutes } from "./routes/session.js";

export interface BuildAppOptions {
  env?: AppEnv;
  adminRoot?: string;
  databaseProbe?: () => Promise<void>;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const env = options.env ?? loadEnv();

  await app.register(cors, { origin: true });
  app.decorate("env", env);

  await registerHealthRoutes(app, {
    databaseProbe: options.databaseProbe ?? (async () => {
      const { prisma } = await import("./plugins/prisma.js");
      await prisma.$queryRawUnsafe("SELECT 1");
    }),
    revision: env.RAILWAY_GIT_COMMIT_SHA ?? "local"
  });
  await registerGroupRoutes(app, env);
  await registerGroupDashboardRoutes(app, env);
  await registerGroupHistoryRoutes(app, env);
  await registerGroupOperationsRoutes(app, env);
  await registerGroupTodayRoutes(app, env);
  await registerGroupParticipationRoutes(app, env);
  await registerGroupKnowledgeRoutes(app, env);
  await registerRecommendationRoutes(app, env);
  await registerSessionRoutes(app, env);
  await registerRestaurantRoutes(app, env);
  await registerRecommendationAdminRoutes(app, env);
  await registerFeedbackRoutes(app, env);
  await registerAdminStaticRoutes(app, {
    enabled: env.NODE_ENV === "production",
    ...(options.adminRoot ? { root: options.adminRoot } : {})
  });

  return app;
}
