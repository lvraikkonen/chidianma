import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import { getWeatherForOfficeDate } from "../src/services/weather/officeWeather";
import { fetchWeatherSummary } from "../src/services/weather/openMeteo";

const env: AppEnv = {
  DATABASE_URL: "postgresql://example",
  TEAM_INVITE_CODE: "team-code",
  SESSION_SECRET: "session-secret",
  EXTENSION_READ_TOKEN: "read-token",
  WEATHER_API_BASE_URL: "https://weather.example/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: 3000
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWeatherSummary", () => {
  it("calls Open-Meteo forecast with office coordinates and summarizes rainy weather", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 18,
          precipitation: 0.2,
          rain: 0.3,
          wind_speed_10m: 12
        }
      })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    const weather = await fetchWeatherSummary(env);
    const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;

    expect(requestedUrl.toString()).toBe(
      "https://weather.example/v1/forecast?latitude=31.2304&longitude=121.4737&current=temperature_2m%2Cprecipitation%2Crain%2Cwind_speed_10m&timezone=Asia%2FShanghai"
    );
    expect(weather).toEqual({
      temperatureC: 18,
      condition: "rainy",
      precipitationProbability: 70,
      summary: "今天有雨，优先推荐近一点、热乎一点的选择。"
    });
  });
});

describe("getWeatherForOfficeDate", () => {
  it("returns a cached weather snapshot for the office date without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const prisma = {
      weatherSnapshot: {
        findUnique: vi.fn().mockResolvedValue({
          date: "2026-07-07",
          city: "Shanghai",
          temperatureC: 31,
          condition: "hot",
          precipitationProbability: 10
        }),
        create: vi.fn()
      }
    } as unknown as PrismaClient;

    const result = await getWeatherForOfficeDate({ prisma, env, date: "2026-07-07" });

    expect(result).toEqual({
      weather: {
        temperatureC: 31,
        condition: "hot",
        precipitationProbability: 10,
        summary: "今天偏热，优先推荐清爽、近一点的选择。"
      },
      weatherUnavailable: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns unavailable and does not cache when the weather fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const prisma = {
      weatherSnapshot: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn()
      }
    } as unknown as PrismaClient;

    const result = await getWeatherForOfficeDate({ prisma, env, date: "2026-07-07" });

    expect(result).toEqual({ weather: null, weatherUnavailable: true });
    expect(prisma.weatherSnapshot.create).not.toHaveBeenCalled();
  });

  it("reuses a concurrently-created snapshot after a unique constraint conflict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 18,
          precipitation: 0,
          rain: 0,
          wind_speed_10m: 8
        }
      })
    } as Response)));
    const prisma = {
      weatherSnapshot: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            date: "2026-07-07",
            city: "Shanghai",
            temperatureC: 31,
            condition: "hot",
            precipitationProbability: 10
          }),
        create: vi.fn().mockRejectedValue({ code: "P2002" })
      }
    } as unknown as PrismaClient;

    const result = await getWeatherForOfficeDate({ prisma, env, date: "2026-07-07" });

    expect(result).toEqual({
      weather: {
        temperatureC: 31,
        condition: "hot",
        precipitationProbability: 10,
        summary: "今天偏热，优先推荐清爽、近一点的选择。"
      },
      weatherUnavailable: false
    });
    expect(prisma.weatherSnapshot.findUnique).toHaveBeenCalledTimes(2);
  });
});
