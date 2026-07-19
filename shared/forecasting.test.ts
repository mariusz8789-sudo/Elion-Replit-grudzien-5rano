import { describe, it, expect } from "vitest";
import { linearTrendForecast, computeSeasonalityIndex } from "./forecasting";

describe("linearTrendForecast", () => {
  it("returns an empty forecast when there's fewer than 2 data points", () => {
    expect(linearTrendForecast([], 3)).toEqual([]);
    expect(linearTrendForecast([{ monthIndex: 0, calendarMonth: 0, value: 100 }], 3)).toEqual([]);
  });

  it("extrapolates a perfectly linear increasing series", () => {
    const series = [0, 1, 2, 3, 4].map((i) => ({ monthIndex: i, calendarMonth: i % 12, value: 1000 + i * 100 }));
    const forecast = linearTrendForecast(series, 3);
    expect(forecast).toEqual([1500, 1600, 1700]);
  });

  it("extrapolates a flat series as flat", () => {
    const series = [0, 1, 2, 3].map((i) => ({ monthIndex: i, calendarMonth: i % 12, value: 500 }));
    const forecast = linearTrendForecast(series, 2);
    expect(forecast).toEqual([500, 500]);
  });

  it("never forecasts a negative value even on a sharply declining series", () => {
    const series = [0, 1, 2].map((i) => ({ monthIndex: i, calendarMonth: i % 12, value: 100 - i * 80 }));
    const forecast = linearTrendForecast(series, 3);
    for (const v of forecast) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("computeSeasonalityIndex", () => {
  it("returns an empty index for no data", () => {
    expect(computeSeasonalityIndex([])).toEqual({});
  });

  it("computes 1.0 for a perfectly flat series", () => {
    const series = [0, 1, 2, 3].map((i) => ({ monthIndex: i, calendarMonth: i, value: 1000 }));
    const index = computeSeasonalityIndex(series);
    expect(Object.values(index).every((v) => v === 1)).toBe(true);
  });

  it("flags a high-revenue month above 1 and a low-revenue month below 1", () => {
    const series = [
      { monthIndex: 0, calendarMonth: 0, value: 500 }, // low January
      { monthIndex: 1, calendarMonth: 5, value: 1500 }, // high June
      { monthIndex: 2, calendarMonth: 0, value: 500 },
      { monthIndex: 3, calendarMonth: 5, value: 1500 },
    ];
    const index = computeSeasonalityIndex(series);
    expect(index[0]).toBeLessThan(1);
    expect(index[5]).toBeGreaterThan(1);
  });
});
