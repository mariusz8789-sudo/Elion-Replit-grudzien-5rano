export interface WeightedOption<T> {
  value: T;
  weight: number;
}

/** Deterministic weighted choice: consumes exactly ONE rng draw, always, regardless of which option is chosen. */
export function pickWeighted<T>(options: readonly WeightedOption<T>[], rng: () => number): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let remaining = rng() * total;
  for (const option of options) {
    remaining -= option.weight;
    if (remaining <= 0) return option.value;
  }
  return options[options.length - 1].value;
}
