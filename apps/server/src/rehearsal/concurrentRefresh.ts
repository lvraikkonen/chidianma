import { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../env.js";
import { getOfficeDate } from "../services/dates.js";
import { refreshGroupTodayRecommendations } from "../services/recommendation/groupToday.js";

const prisma = new PrismaClient();
const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  SESSION_SECRET: "stage7b-rehearsal-secret",
  ALLOW_PUBLIC_GROUP_CREATION: false,
  LUCKY_RESTAURANT_WHEEL_ENABLED: false,
  LUCKY_RESTAURANT_WHEEL_GROUP_IDS: [],
  IDENTITY_TOKEN_TTL_DAYS: 90,
  GROUP_SESSION_TTL_DAYS: 14,
  WEATHER_API_BASE_URL: "https://invalid.example",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: 3000
} satisfies AppEnv;

async function run() {
  const officeDate = getOfficeDate(new Date(), env.OFFICE_TIMEZONE);
  const identity = await prisma.identity.create({ data: { displayName: "Rehearsal Admin" } });
  const group = await prisma.lunchGroup.create({
    data: {
      name: "Stage 7B Rehearsal",
      inviteCodeHash: "rehearsal-invite-hash",
      createdByIdentityId: identity.id,
      officeTimezone: env.OFFICE_TIMEZONE,
      officeCity: env.OFFICE_CITY,
      officeLatitude: env.OFFICE_LATITUDE,
      officeLongitude: env.OFFICE_LONGITUDE
    }
  });
  const membership = await prisma.groupMembership.create({
    data: { groupId: group.id, identityId: identity.id, role: "admin" }
  });
  await prisma.groupSettings.create({ data: { groupId: group.id } });
  await prisma.scoringWeights.create({ data: { groupId: group.id } });
  const restaurant = await prisma.restaurant.create({
    data: {
      groupId: group.id,
      name: "Rehearsal Noodles",
      distanceMinutes: 5,
      tags: ["quick"],
      createdByMembershipId: membership.id
    }
  });
  await prisma.recommendation.create({
    data: {
      groupId: group.id,
      restaurantId: restaurant.id,
      createdByMembershipId: membership.id,
      reason: "Real PostgreSQL concurrency rehearsal",
      weatherTags: ["clear"],
      weekdayTags: [],
      moodTags: ["quick"]
    }
  });
  await prisma.weatherSnapshot.create({
    data: {
      groupId: group.id,
      date: officeDate,
      city: group.officeCity,
      temperatureC: 24,
      condition: "clear",
      precipitationProbability: 0
    }
  });

  const context = {
    identityId: identity.id,
    groupId: group.id,
    membershipId: membership.id,
    role: "admin" as const
  };
  const responses = await Promise.all([
    refreshGroupTodayRecommendations({ prisma, env, groupId: group.id, membership: context }),
    refreshGroupTodayRecommendations({ prisma, env, groupId: group.id, membership: context })
  ]);
  const [batchCount, currentCount] = await Promise.all([
    prisma.dailyRecommendationBatch.count({ where: { groupId: group.id, officeDate } }),
    prisma.dailyRecommendationBatch.count({ where: { groupId: group.id, officeDate, isCurrent: true } })
  ]);
  if (responses.length !== 2 || batchCount !== 2 || currentCount !== 1) {
    throw new Error("stage7b_postgres_refresh_invariant_failed");
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    calls: responses.length,
    batches: batchCount,
    currentBatches: currentCount
  })}\n`);
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "stage7b_rehearsal_failed"}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
