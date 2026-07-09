import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../env.js";
import { DEFAULT_GROUP_ID } from "../groups/defaultGroup.js";
import type { WeatherSummary } from "./mockWeather.js";
import { fetchWeatherSummary } from "./openMeteo.js";

export async function getWeatherForOfficeDate(input: {
  prisma: PrismaClient;
  env: AppEnv;
  date: string;
}): Promise<{ weather: WeatherSummary | null; weatherUnavailable: boolean }> {
  const snapshotWhere = {
    groupId_date_city: {
      groupId: DEFAULT_GROUP_ID,
      date: input.date,
      city: input.env.OFFICE_CITY
    }
  };
  const existing = await input.prisma.weatherSnapshot.findUnique({
    where: snapshotWhere
  });

  if (existing) {
    return {
      weather: snapshotToWeather(existing),
      weatherUnavailable: false
    };
  }

  try {
    const weather = await fetchWeatherSummary(input.env);
    try {
      await input.prisma.weatherSnapshot.create({
        data: {
          groupId: DEFAULT_GROUP_ID,
          date: input.date,
          city: input.env.OFFICE_CITY,
          temperatureC: weather.temperatureC,
          condition: weather.condition,
          precipitationProbability: weather.precipitationProbability,
          rawPayload: { source: "open-meteo" }
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const concurrent = await input.prisma.weatherSnapshot.findUnique({
          where: snapshotWhere
        });
        if (concurrent) {
          return { weather: snapshotToWeather(concurrent), weatherUnavailable: false };
        }
      }
      throw error;
    }
    return { weather, weatherUnavailable: false };
  } catch {
    return { weather: null, weatherUnavailable: true };
  }
}

function snapshotToWeather(snapshot: {
  temperatureC: number | null;
  condition: string;
  precipitationProbability: number | null;
}): WeatherSummary {
  return {
    temperatureC: snapshot.temperatureC ?? 20,
    condition: snapshot.condition as WeatherSummary["condition"],
    precipitationProbability: snapshot.precipitationProbability ?? 0,
    summary: weatherSummaryText(snapshot.condition)
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

function weatherSummaryText(condition: string): string {
  if (condition === "rainy") return "今天有雨，优先推荐近一点、热乎一点的选择。";
  if (condition === "hot") return "今天偏热，优先推荐清爽、近一点的选择。";
  return "今天天气稳定，按距离和同事推荐来挑。";
}
