import { NextRequest, NextResponse } from "next/server";
import { emptyCoverage } from "./evidence";
import { report, type Environment, type Source } from "./report";
import { exampleInput } from "./example";

const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" };

export async function repeatBuyerGet(req: NextRequest, deps: {
  authorize: () => boolean; environment: () => Environment; read: (at: number) => Promise<Source>; now?: () => number;
}) {
  const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers });
  if (!deps.authorize()) return json({ error: "Unauthorized" }, 401);
  const q = req.nextUrl.searchParams;
  const month = q.get("month") ?? undefined;
  const campaign = q.get("campaign") ?? undefined;
  const example = q.get("example") === "1";
  const now = (deps.now ?? Date.now)();
  const at = q.has("asOf") ? Date.parse(q.get("asOf")!) : now;
  if ([...q.keys()].some(k => !["month","campaign","example","asOf"].includes(k) || q.getAll(k).length > 1) ||
      month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      campaign !== undefined && !/^(unknown|c-[a-f0-9]{20}|winter-launch)$/.test(campaign) ||
      q.has("example") && !example || !Number.isFinite(at) || at <= 0 || at > now ||
      q.has("asOf") && new Date(at).toISOString() !== q.get("asOf")) return json({ error: "Invalid report filter" }, 400);
  try {
    if (example) {
      if (deps.environment() !== "staging") return json({error: "Unavailable"}, 404);
      const input = exampleInput();
      if (q.has("asOf")) input.asOf = at;
      const count = input.purchases.filter(p => p.knownAt <= input.asOf && p.at <= input.asOf).length;
      const source: Source = { input, labels: { "winter-launch": "Winter launch" }, environment: "staging",
        coverage: { ...emptyCoverage(), verified: count, matchable: count } };
      return json(report(source, { month, campaign }, true), 200);
    }
    return json(report(await deps.read(at), { month, campaign }, false), 200);
  } catch {
    return json({ error: "The report sources are unavailable. Retry to read a complete snapshot." }, 503);
  }
}
