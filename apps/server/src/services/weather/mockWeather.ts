export interface WeatherSummary {
  temperatureC: number;
  condition: "rainy" | "hot" | "cold" | "clear" | "windy";
  precipitationProbability: number;
  windLevel?: string | undefined;
  summary: string;
}

export function getMockWeather(): WeatherSummary {
  return {
    temperatureC: 28,
    condition: "rainy",
    precipitationProbability: 70,
    summary: "今天有雨，优先推荐近一点、热乎一点的选择。"
  };
}
