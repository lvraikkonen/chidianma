import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadEnv } from "./env.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRecommendationAdminRoutes } from "./routes/recommendations-admin.js";
import { registerRecommendationRoutes } from "./routes/recommendations.js";
import { registerRestaurantRoutes } from "./routes/restaurants.js";
import { registerSessionRoutes } from "./routes/session.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  const env = loadEnv();

  await app.register(cors, { origin: true });
  app.decorate("env", env);

  await registerHealthRoutes(app);
  await registerRecommendationRoutes(app, env);
  await registerSessionRoutes(app, env);
  await registerRestaurantRoutes(app, env);
  await registerRecommendationAdminRoutes(app, env);
  await registerFeedbackRoutes(app, env);

  return app;
}
