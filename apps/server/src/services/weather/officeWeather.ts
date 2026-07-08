import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../env.js";
import type { WeatherSummary } from "./mockWeather.js";
import { fetchWeatherSummary } from "./openMeteo.js";

export async function getWeatherForOfficeDate(input: {
  prisma: PrismaClient;
  env: AppEnv;
  date: string;
}): Promise<{ weather: WeatherSummary | null; weatherUnavailable: boolean }> {
  const existing = await input.prisma.weatherSnapshot.findUnique({
    where: {
      date_city: {
        date: input.date,
        city: input.env.OFFICE_CITY
      }
    }
  });

  if (existing) {
    return {
      weather: {
        temperatureC: existing.temperatureC ?? 20,
        condition: existing.condition as WeatherSummary["condition"],
        precipitationProbability: existing.precipitationProbability ?? 0,
        summary: weatherSummaryText(existing.condition)
      },
      weatherUnavailable: false
    };
  }

  try {
    const weather = await fetchWeatherSummary(input.env);
    await input.prisma.weatherSnapshot.create({
      data: {
        date: input.date,
        city: input.env.OFFICE_CITY,
        temperatureC: weather.temperatureC,
        condition: weather.condition,
        precipitationProbability: weather.precipitationProbability,
        rawPayload: { source: "open-meteo" }
      }
    });
    return { weather, weatherUnavailable: false };
  } catch {
    return { weather: null, weatherUnavailable: true };
  }
}

function weatherSummaryText(condition: string): string {
  if (condition === "rainy") return "今天有雨，优先推荐近一点、热乎一点的选择。";
  if (condition === "hot") return "今天偏热，优先推荐清爽、近一点的选择。";
  return "今天天气稳定，按距离和同事推荐来挑。";
}
