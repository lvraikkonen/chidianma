import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherSummaryForOffice } from "../src/services/weather/openMeteo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("group office weather", () => {
  it("calls Open-Meteo with the group's office coordinates", async () => {
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

    const weather = await fetchWeatherSummaryForOffice({
      apiBaseUrl: "https://weather.example/v1",
      latitude: 31.2304,
      longitude: 121.4737,
      timezone: "Asia/Shanghai"
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("latitude=31.2304");
    expect(weather).toMatchObject({ condition: "rainy", temperatureC: 18 });
  });
});
