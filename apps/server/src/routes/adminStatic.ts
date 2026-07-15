import fastifyStatic from "@fastify/static";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

export interface AdminStaticRouteOptions {
  enabled: boolean;
  root?: string;
}

function defaultAdminRoot(): string {
  return fileURLToPath(new URL("../../../admin/dist/", import.meta.url));
}

export async function registerAdminStaticRoutes(
  app: FastifyInstance,
  options: AdminStaticRouteOptions
): Promise<void> {
  if (!options.enabled) {
    return;
  }

  const root = options.root ?? defaultAdminRoot();
  try {
    await access(root);
    await access(join(root, "index.html"));
  } catch {
    throw new Error(`Admin production build is missing at ${root}`);
  }

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url === "/" || request.url === "/index.html") {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    maxAge: "1y",
    immutable: true
  });
}
