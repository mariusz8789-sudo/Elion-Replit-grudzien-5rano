// Deterministic, documented forecasting - same "historical-aggregate" honesty convention as the
// existing Fleet Predictor (server/routes.ts /api/fleet-predictor): real least-squares trend
// extrapolation and real seasonal indices over the company's own history, never a fabricated
// "AI-powered" black box, and an honest "not enough data" response instead of guessing.
export const FORECAST_METHODOLOGY = "movex-forecast-v1";
export const MIN_MONTHS_FOR_FORECAST = 3;

export interface MonthlyValue {
  monthIndex: number; // sequential index, 0 = earliest month in the series
  calendarMonth: number; // 0-11, for seasonality grouping
  value: number;
}

// Ordinary least-squares linear regression over (monthIndex, value) pairs, then projects
// `monthsAhead` further points. Returns [] if there isn't enough history to fit a line.
export function linearTrendForecast(series: MonthlyValue[], monthsAhead: number): number[] {
  if (series.length < 2) return [];
  const n = series.length;
  const sumX = series.reduce((s, p) => s + p.monthIndex, 0);
  const sumY = series.reduce((s, p) => s + p.value, 0);
  const sumXY = series.reduce((s, p) => s + p.monthIndex * p.value, 0);
  const sumXX = series.reduce((s, p) => s + p.monthIndex * p.monthIndex, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return new Array(monthsAhead).fill(sumY / n);

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const lastIndex = series[series.length - 1].monthIndex;
  return Array.from({ length: monthsAhead }, (_, i) => {
    const projected = intercept + slope * (lastIndex + i + 1);
    return Math.max(0, Math.round(projected));
  });
}

// Seasonal index per calendar month = that month's average value / overall average, so 1.2 means
// "20% above the yearly average". Only meaningful with enough distinct calendar months observed.
export function computeSeasonalityIndex(series: MonthlyValue[]): Record<number, number> {
  if (series.length === 0) return {};
  const overallAvg = series.reduce((s, p) => s + p.value, 0) / series.length;
  if (overallAvg === 0) return {};

  const byMonth = new Map<number, number[]>();
  for (const p of series) {
    if (!byMonth.has(p.calendarMonth)) byMonth.set(p.calendarMonth, []);
    byMonth.get(p.calendarMonth)!.push(p.value);
  }

  const index: Record<number, number> = {};
  for (const [month, values] of Array.from(byMonth.entries())) {
    const avg = values.reduce((s: number, v: number) => s + v, 0) / values.length;
    index[month] = Math.round((avg / overallAvg) * 100) / 100;
  }
  return index;
}
