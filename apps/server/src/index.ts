import { buildApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const app = await buildApp();

await app.listen({
  port: env.PORT,
  host: "::"
});
