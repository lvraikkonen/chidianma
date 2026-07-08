import type { AppEnv } from "../../env.js";
import type { WeatherSummary } from "./mockWeather.js";

export async function fetchWeatherSummary(env: AppEnv): Promise<WeatherSummary> {
  const url = buildWeatherUrl(env.WEATHER_API_BASE_URL);
  url.searchParams.set("latitude", String(env.OFFICE_LATITUDE));
  url.searchParams.set("longitude", String(env.OFFICE_LONGITUDE));
  url.searchParams.set("current", "temperature_2m,precipitation,rain,wind_speed_10m");
  url.searchParams.set("timezone", env.OFFICE_TIMEZONE);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather API failed with ${response.status}`);
  const payload = await response.json() as {
    current?: {
      temperature_2m?: number;
      precipitation?: number;
      rain?: number;
      wind_speed_10m?: number;
    };
  };

  const temperatureC = payload.current?.temperature_2m ?? 20;
  const rain = (payload.current?.rain ?? 0) + (payload.current?.precipitation ?? 0);
  const wind = payload.current?.wind_speed_10m ?? 0;
  const condition = rain > 0 ? "rainy" : temperatureC >= 28 ? "hot" : temperatureC <= 8 ? "cold" : wind >= 25 ? "windy" : "clear";

  return {
    temperatureC,
    condition,
    precipitationProbability: rain > 0 ? 70 : 10,
    summary: condition === "rainy"
      ? "今天有雨，优先推荐近一点、热乎一点的选择。"
      : condition === "hot"
        ? "今天偏热，优先推荐清爽、近一点的选择。"
        : "今天天气稳定，按距离和同事推荐来挑。"
  };
}

function buildWeatherUrl(baseUrl: string): URL {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("forecast", normalized);
}
