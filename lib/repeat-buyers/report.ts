import { summarize } from "./calculator";
import type { CohortInput } from "./contract";
import type { Coverage } from "./evidence";

export type Environment = "staging" | "production";
export type Source = { input: CohortInput; coverage: Coverage; labels: Record<string, string>; environment: Environment };
export function report(source: Source, scope: { month?: string; campaign?: string }, example: boolean) {
  const summary = summarize({ ...source.input, ...scope });
  return {
    asOf: new Date(source.input.asOf).toISOString(), environment: source.environment, example,
    historyComplete: source.input.historyComplete, coverage: source.coverage, summary,
    campaignNames: Object.fromEntries(summary.campaigns.map((c, i) => [c, c === "unknown" ? "Unknown" :
      source.labels[c] ?? "Recorded campaign " + (i + 1)])),
  };
}
export type RepeatBuyerReport = ReturnType<typeof report>;
