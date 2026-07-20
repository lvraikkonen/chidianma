import "dotenv/config";
import { z } from "zod";

const StrictBooleanSchema = z.union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true");

const GroupIdAllowlistSchema = z.string().default("").transform((value) => (
  [...new Set(value.split(",").map((groupId) => groupId.trim()).filter(Boolean))]
));

const IanaTimeZoneSchema = z.string().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "OFFICE_TIMEZONE must be a valid IANA timezone");

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(8),
  ALLOW_PUBLIC_GROUP_CREATION: StrictBooleanSchema.default("true"),
  LUCKY_RESTAURANT_WHEEL_ENABLED: StrictBooleanSchema.default("false"),
  LUCKY_RESTAURANT_WHEEL_GROUP_IDS: GroupIdAllowlistSchema,
  IDENTITY_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
  GROUP_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  WEATHER_API_BASE_URL: z.string().url().default("https://api.open-meteo.com/v1"),
  OFFICE_CITY: z.string().min(1).default("Shanghai"),
  OFFICE_LATITUDE: z.coerce.number().min(-90).max(90).default(31.2304),
  OFFICE_LONGITUDE: z.coerce.number().min(-180).max(180).default(121.4737),
  OFFICE_TIMEZONE: IanaTimeZoneSchema.default("Asia/Shanghai"),
  PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  RAILWAY_GIT_COMMIT_SHA: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000)
}).superRefine((env, context) => {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (env.SESSION_SECRET.length < 32) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SESSION_SECRET"],
      message: "SESSION_SECRET must be at least 32 chars in production"
    });
  }

  if (!env.PUBLIC_API_BASE_URL.startsWith("https://")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PUBLIC_API_BASE_URL"],
      message: "PUBLIC_API_BASE_URL must use HTTPS in production"
    });
  }
});

export type AppEnv = z.infer<typeof EnvSchema>;

const PRODUCTION_REQUIRED_KEYS = [
  "ALLOW_PUBLIC_GROUP_CREATION",
  "IDENTITY_TOKEN_TTL_DAYS",
  "GROUP_SESSION_TTL_DAYS",
  "WEATHER_API_BASE_URL",
  "OFFICE_CITY",
  "OFFICE_LATITUDE",
  "OFFICE_LONGITUDE",
  "OFFICE_TIMEZONE",
  "PUBLIC_API_BASE_URL"
] as const;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (source.NODE_ENV === "production") {
    const missing = PRODUCTION_REQUIRED_KEYS.filter((key) => !source[key]);
    if (missing.length > 0) {
      throw new Error(`Production environment must explicitly configure: ${missing.join(", ")}`);
    }
  }
  return EnvSchema.parse(source);
}
