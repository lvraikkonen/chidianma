import type { FastifyReply } from "fastify";
import { AuthError } from "../services/auth/errors.js";

export function authErrorResponse(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  throw error;
}
