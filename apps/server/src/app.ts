import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadEnv } from "./env";
import { registerHealthRoutes } from "./routes/health";
import { registerRecommendationRoutes } from "./routes/recommendations";

export async function buildApp() {
  const app = Fastify({ logger: true });
  const env = loadEnv();

  await app.register(cors, { origin: true });
  app.decorate("env", env);

  await registerHealthRoutes(app);
  await registerRecommendationRoutes(app, env);

  return app;
}
