import { loadEnv } from "./env.js";

export function checkDeploymentEnvironment(source: NodeJS.ProcessEnv = process.env): string {
  loadEnv(source);
  return JSON.stringify({ ok: true, check: "environment" });
}
