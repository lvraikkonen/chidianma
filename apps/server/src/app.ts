import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { LogController, type FastifyBaseLogger } from "fastify";
import { loadEnv, type AppEnv } from "./env.js";
import { registerAdminStaticRoutes } from "./routes/adminStatic.js";
import { registerGroupCapabilitiesRoutes } from "./routes/groupCapabilities.js";
import { registerGroupDashboardRoutes } from "./routes/groupDashboard.js";
import { registerGroupHistoryRoutes } from "./routes/groupHistory.js";
import { registerGroupOperationsRoutes } from "./routes/groupOperations.js";
import { registerGroupKnowledgeRoutes } from "./routes/groupKnowledge.js";
import { registerGroupParticipationRoutes } from "./routes/groupParticipation.js";
import { registerGroupRoutes } from "./routes/groups.js";
import { registerGroupTodayRoutes } from "./routes/groupToday.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIdentityRoutes } from "./routes/identities.js";
import { AuthError } from "./services/auth/errors.js";
import {
  classifiedDatabaseErrorCode,
  isAllowedCorsOrigin,
  rateLimitClientIp,
  safeRequestLogContext,
  SafeOperationalError
} from "./security/requestSecurity.js";

export interface BuildAppOptions {
  env?: AppEnv;
  adminRoot?: string;
  databaseProbe?: () => Promise<void>;
  loggerInstance?: FastifyBaseLogger;
}

function errorStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }
  const statusCode = error.statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const env = options.env ?? loadEnv();
  const app = Fastify({
    ...(options.loggerInstance
      ? { loggerInstance: options.loggerInstance }
      : { logger: env.NODE_ENV !== "test" }),
    logController: new LogController({ disableRequestLogging: true })
  });

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, isAllowedCorsOrigin(origin, env));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false,
    maxAge: 600
  });
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => rateLimitClientIp(request, env),
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "rate_limit_exceeded",
      message: "Rate limit exceeded",
      retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000))
    })
  });
  app.decorate("env", env);

  app.addHook("onResponse", async (request, reply) => {
    request.log.info({ ...safeRequestLogContext(request), statusCode: reply.statusCode }, "request_completed");
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
      void reply.code(statusCode).send({ error: error.error, message: error.message });
      return;
    }
    const statusCode = errorStatusCode(error);
    if (statusCode !== undefined && statusCode < 500) {
      const retryAfterHeader = reply.getHeader("retry-after");
      const retryAfterSeconds = typeof retryAfterHeader === "number"
        ? retryAfterHeader
        : typeof retryAfterHeader === "string"
          ? Number(retryAfterHeader)
          : Number.NaN;
      void reply.code(statusCode).send({
        error: statusCode === 429 ? "rate_limit_exceeded" : "bad_request",
        message: statusCode === 429 ? "Rate limit exceeded" : "Request is invalid",
        ...(statusCode === 429 && Number.isFinite(retryAfterSeconds)
          ? { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) }
          : {})
      });
      return;
    }
    const operationError = error instanceof SafeOperationalError ? error : undefined;
    request.log.error({
      ...safeRequestLogContext(request),
      ...(operationError?.context.groupId ? { groupId: operationError.context.groupId } : {}),
      ...(operationError?.context.officeDate ? { officeDate: operationError.context.officeDate } : {}),
      operation: operationError?.operation ?? "request",
      retryCount: operationError?.context.retryCount ?? 0,
      databaseErrorCode: classifiedDatabaseErrorCode(operationError?.cause ?? error)
    }, "request_failed");
    void reply.code(500).send({ error: "internal_error", message: "Internal server error" });
  });

  await registerHealthRoutes(app, {
    databaseProbe: options.databaseProbe ?? (async () => {
      const { prisma } = await import("./plugins/prisma.js");
      await prisma.$queryRawUnsafe("SELECT 1");
    }),
    revision: env.RAILWAY_GIT_COMMIT_SHA ?? "local"
  });
  await registerIdentityRoutes(app, env);
  await registerGroupRoutes(app, env);
  await registerGroupCapabilitiesRoutes(app, env);
  await registerGroupDashboardRoutes(app, env);
  await registerGroupHistoryRoutes(app, env);
  await registerGroupOperationsRoutes(app, env);
  await registerGroupTodayRoutes(app, env);
  await registerGroupParticipationRoutes(app, env);
  await registerGroupKnowledgeRoutes(app, env);
  await registerAdminStaticRoutes(app, {
    enabled: env.NODE_ENV === "production",
    ...(options.adminRoot ? { root: options.adminRoot } : {})
  });

  return app;
}
