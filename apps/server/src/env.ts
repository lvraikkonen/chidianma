import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TEAM_INVITE_CODE: z.string().min(1),
  SESSION_SECRET: z.string().min(8),
  EXTENSION_READ_TOKEN: z.string().min(1),
  ALLOW_PUBLIC_GROUP_CREATION: z.coerce.boolean().default(true),
  IDENTITY_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
  GROUP_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  WEATHER_API_BASE_URL: z.string().url().default("https://api.open-meteo.com/v1"),
  OFFICE_CITY: z.string().min(1).default("Shanghai"),
  OFFICE_LATITUDE: z.coerce.number().default(31.2304),
  OFFICE_LONGITUDE: z.coerce.number().default(121.4737),
  OFFICE_TIMEZONE: z.string().min(1).default("Asia/Shanghai"),
  PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000)
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const env = EnvSchema.parse(source);
  if (env.NODE_ENV === "production" && env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 chars in production");
  }
  return env;
}
