import { READ_TOKEN_HEADER } from "@lunch/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "../../env.js";

export function hasReadToken(request: FastifyRequest, env: AppEnv): boolean {
  const token = request.headers[READ_TOKEN_HEADER];
  return token === env.EXTENSION_READ_TOKEN;
}

export function requireReadToken(request: FastifyRequest, reply: FastifyReply, env: AppEnv): void {
  if (!hasReadToken(request, env)) {
    reply.code(401);
    throw new Error("Invalid read token");
  }
}
