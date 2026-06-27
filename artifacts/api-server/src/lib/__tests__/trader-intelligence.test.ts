import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// ─── Similarity Engine ──────────────────────────────────────────────────────

function scoreVectorSimilarity(
  a: { z: number; l: number; am: number; c: number; tq: number },
  b: { z: number; l: number; am: number; c: number; tq: number },
): number {
  const d = Math.sqrt(
    Math.pow(a.z - b.z, 2) +
    Math.pow(a.l - b.l, 2) +
    Math.pow(a.am - b.am, 2) +
    Math.pow(a.c - b.c, 2) +
    Math.pow(a.tq - b.tq, 2),
  );
  return Math.max(0, Math.round((1 - d / 223.6) * 100));
}

describe("scoreVectorSimilarity", () => {
  test("identical vectors return 100", () => {
    const v = { z: 80, l: 75, am: 70, c: 65, tq: 72 };
    assert.equal(scoreVectorSimilarity(v, v), 100);
  });

  test("maximally different vectors return ~0", () => {
    const a = { z: 0, l: 0, am: 0, c: 0, tq: 0 };
    const b = { z: 100, l: 100, am: 100, c: 100, tq: 100 };
    assert.ok(scoreVectorSimilarity(a, b) <= 1);
  });

  test("similarity is symmetric", () => {
    const a = { z: 80, l: 75, am: 60, c: 70, tq: 65 };
    const b = { z: 70, l: 65, am: 75, c: 60, tq: 80 };
    assert.equal(scoreVectorSimilarity(a, b), scoreVectorSimilarity(b, a));
  });

  test("small score differences produce high similarity", () => {
    const a = { z: 80, l: 75, am: 70, c: 65, tq: 72 };
    const b = { z: 82, l: 73, am: 68, c: 67, tq: 74 };
    assert.ok(scoreVectorSimilarity(a, b) >= 95);
  });

  test("large score differences produce low similarity", () => {
    const a = { z: 90, l: 90, am: 90, c: 90, tq: 90 };
    const b = { z: 30, l: 30, am: 30, c: 30, tq: 30 };
    assert.ok(scoreVectorSimilarity(a, b) < 60);
  });

  test("never returns negative", () => {
    const a = { z: 0, l: 0, am: 0, c: 0, tq: 0 };
    const b = { z: 100, l: 100, am: 100, c: 100, tq: 100 };
    assert.ok(scoreVectorSimilarity(a, b) >= 0);
  });

  test("always returns <= 100", () => {
    const v = { z: 50, l: 50, am: 50, c: 50, tq: 50 };
    assert.ok(scoreVectorSimilarity(v, v) <= 100);
  });
});

// ─── Decision Validation Logic ─────────────────────────────────────────────

function validateDecisionInput(body: Record<string, unknown>): string | null {
  if (!body["pair"]) return "Missing required field: pair";
  if (!body["traderDecision"]) return "Missing required field: traderDecision";
  return null;
}

function isValidDecision(d: string): boolean {
  return ["accepted", "rejected", "delayed"].includes(d);
}

function isValidOutcome(o: string): boolean {
  return ["win", "loss", "missed", "pending"].includes(o);
}

describe("decision input validation", () => {
  test("returns error when pair is missing", () => {
    const err = validateDecisionInput({ traderDecision: "accepted" });
    assert.equal(err, "Missing required field: pair");
  });

  test("returns error when traderDecision is missing", () => {
    const err = validateDecisionInput({ pair: "EURUSD" });
    assert.equal(err, "Missing required field: traderDecision");
  });

  test("returns null for valid input", () => {
    const err = validateDecisionInput({ pair: "EURUSD", traderDecision: "accepted" });
    assert.equal(err, null);
  });

  test("accepted is a valid decision", () => assert.ok(isValidDecision("accepted")));
  test("rejected is a valid decision", () => assert.ok(isValidDecision("rejected")));
  test("delayed is a valid decision", () => assert.ok(isValidDecision("delayed")));
  test("unknown is not a valid decision", () => assert.ok(!isValidDecision("unknown")));

  test("win is a valid outcome", () => assert.ok(isValidOutcome("win")));
  test("loss is a valid outcome", () => assert.ok(isValidOutcome("loss")));
  test("missed is a valid outcome", () => assert.ok(isValidOutcome("missed")));
  test("pending is a valid outcome", () => assert.ok(isValidOutcome("pending")));
  test("cancelled is not a valid outcome", () => assert.ok(!isValidOutcome("cancelled")));
});

// ─── Context Tag Parsing ────────────────────────────────────────────────────

function parseTags(json: string): string[] {
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

describe("context tag parsing", () => {
  test("parses a valid JSON array", () => {
    const tags = parseTags('["Trend looked weak","News uncertainty"]');
    assert.deepEqual(tags, ["Trend looked weak", "News uncertainty"]);
  });

  test("returns empty array for malformed JSON", () => {
    assert.deepEqual(parseTags("not-json"), []);
  });

  test("returns empty array for empty string", () => {
    assert.deepEqual(parseTags(""), []);
  });

  test("returns empty array for empty array literal", () => {
    assert.deepEqual(parseTags("[]"), []);
  });

  test("handles single tag", () => {
    assert.deepEqual(parseTags('["Zone looked messy"]'), ["Zone looked messy"]);
  });
});

// ─── Psychology Calculation ─────────────────────────────────────────────────

type MockDecision = {
  traderConfidence: number | null;
  pair: string;
  session: string | null;
  regime: string | null;
  traderDecision: string;
  createdAt: Date;
  outcome: string | null;
};

function computeOverTime(decisions: MockDecision[]): { date: string; avgConfidence: number; count: number }[] {
  const byDate: Record<string, { sum: number; count: number }> = {};
  for (const d of decisions) {
    if (d.traderConfidence == null) continue;
    const date = d.createdAt.toISOString().slice(0, 10);
    byDate[date] ??= { sum: 0, count: 0 };
    byDate[date]!.sum += d.traderConfidence;
    byDate[date]!.count++;
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({ date, avgConfidence: Math.round(sum / count), count }));
}

describe("psychology — confidence over time", () => {
  test("computes daily average confidence", () => {
    const decisions: MockDecision[] = [
      { traderConfidence: 80, pair: "EURUSD", session: "london", regime: "trending", traderDecision: "accepted", createdAt: new Date("2026-06-10"), outcome: null },
      { traderConfidence: 60, pair: "EURUSD", session: "london", regime: "trending", traderDecision: "rejected", createdAt: new Date("2026-06-10"), outcome: null },
      { traderConfidence: 90, pair: "GBPUSD", session: "new_york", regime: "ranging", traderDecision: "accepted", createdAt: new Date("2026-06-11"), outcome: null },
    ];
    const result = computeOverTime(decisions);
    assert.equal(result.length, 2);
    assert.equal(result[0]!.date, "2026-06-10");
    assert.equal(result[0]!.avgConfidence, 70);
    assert.equal(result[0]!.count, 2);
    assert.equal(result[1]!.date, "2026-06-11");
    assert.equal(result[1]!.avgConfidence, 90);
    assert.equal(result[1]!.count, 1);
  });

  test("skips decisions without confidence", () => {
    const decisions: MockDecision[] = [
      { traderConfidence: null, pair: "EURUSD", session: null, regime: null, traderDecision: "accepted", createdAt: new Date("2026-06-10"), outcome: null },
      { traderConfidence: 75, pair: "GBPUSD", session: null, regime: null, traderDecision: "accepted", createdAt: new Date("2026-06-10"), outcome: null },
    ];
    const result = computeOverTime(decisions);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.avgConfidence, 75);
    assert.equal(result[0]!.count, 1);
  });

  test("returns empty array when no decisions have confidence", () => {
    const decisions: MockDecision[] = [
      { traderConfidence: null, pair: "EURUSD", session: null, regime: null, traderDecision: "rejected", createdAt: new Date(), outcome: null },
    ];
    assert.deepEqual(computeOverTime(decisions), []);
  });
});

// ─── Engine vs Trader Comparison ────────────────────────────────────────────

function categorizeDecision(traderDecision: string, engineDecision: string | null): string {
  if (!engineDecision) return "no_engine_data";
  const traderAccepted = traderDecision === "accepted";
  const botAccepted = engineDecision === "accepted";
  if (traderAccepted && botAccepted) return "bothAccepted";
  if (!traderAccepted && !botAccepted) return "bothRejected";
  if (botAccepted && !traderAccepted) return "botAcceptedTraderRejected";
  return "traderAcceptedBotRejected";
};

function computeAgreementRate(decisions: { traderDecision: string; engineDecision: string | null }[]): number {
  const withBoth = decisions.filter((d) => d.engineDecision != null);
  if (withBoth.length === 0) return 0;
  const agreements = withBoth.filter((d) => {
    const cat = categorizeDecision(d.traderDecision, d.engineDecision);
    return cat === "bothAccepted" || cat === "bothRejected";
  }).length;
  return agreements / withBoth.length;
}

describe("engine vs trader comparison", () => {
  test("both accepted", () => {
    assert.equal(categorizeDecision("accepted", "accepted"), "bothAccepted");
  });

  test("both rejected", () => {
    assert.equal(categorizeDecision("rejected", "rejected"), "bothRejected");
  });

  test("bot accepted, trader rejected", () => {
    assert.equal(categorizeDecision("rejected", "accepted"), "botAcceptedTraderRejected");
  });

  test("trader accepted, bot rejected", () => {
    assert.equal(categorizeDecision("accepted", "rejected"), "traderAcceptedBotRejected");
  });

  test("no engine data returns no_engine_data", () => {
    assert.equal(categorizeDecision("accepted", null), "no_engine_data");
  });

  test("agreement rate is 100% when all decisions agree", () => {
    const decisions = [
      { traderDecision: "accepted", engineDecision: "accepted" },
      { traderDecision: "rejected", engineDecision: "rejected" },
    ];
    assert.equal(computeAgreementRate(decisions), 1.0);
  });

  test("agreement rate is 0% when no decisions agree", () => {
    const decisions = [
      { traderDecision: "accepted", engineDecision: "rejected" },
      { traderDecision: "rejected", engineDecision: "accepted" },
    ];
    assert.equal(computeAgreementRate(decisions), 0.0);
  });

  test("agreement rate is 50% with mixed decisions", () => {
    const decisions = [
      { traderDecision: "accepted", engineDecision: "accepted" },
      { traderDecision: "accepted", engineDecision: "rejected" },
    ];
    assert.equal(computeAgreementRate(decisions), 0.5);
  });

  test("ignores decisions with no engine context", () => {
    const decisions = [
      { traderDecision: "accepted", engineDecision: null },
      { traderDecision: "accepted", engineDecision: "accepted" },
    ];
    assert.equal(computeAgreementRate(decisions), 1.0);
  });

  test("returns 0 when all decisions have no engine context", () => {
    const decisions = [
      { traderDecision: "accepted", engineDecision: null },
    ];
    assert.equal(computeAgreementRate(decisions), 0);
  });
});

// ─── Recommendation Stats ──────────────────────────────────────────────────

type ScoredDecision = {
  similarityScore: number;
  outcome: string | null;
  expectedRr: number | null;
  traderConfidence: number | null;
  traderNotes: string | null;
};

function computeRecommendation(matches: ScoredDecision[]): {
  totalMatches: number;
  winRate: number | null;
  profitFactor: number | null;
  avgRr: number | null;
  avgConfidence: number | null;
} {
  if (matches.length === 0) return { totalMatches: 0, winRate: null, profitFactor: null, avgRr: null, avgConfidence: null };

  const withOutcome = matches.filter((m) => m.outcome && m.outcome !== "pending");
  const wins = withOutcome.filter((m) => m.outcome === "win").length;
  const losses = withOutcome.filter((m) => m.outcome === "loss").length;
  const winRate = withOutcome.length > 0 ? wins / withOutcome.length : null;

  const rrs = matches.map((m) => m.expectedRr ?? 0).filter((r) => r > 0);
  const avgRr = rrs.length > 0 ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null;

  const confs = matches.map((m) => m.traderConfidence).filter((c): c is number => c != null);
  const avgConfidence = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : null;

  const grossWin = wins * (avgRr ?? 1);
  const profitFactor = losses > 0 ? grossWin / losses : wins > 0 ? 999 : null;

  return { totalMatches: matches.length, winRate, profitFactor, avgRr, avgConfidence };
}

describe("recommendation stats", () => {
  test("returns null stats for empty match set", () => {
    const r = computeRecommendation([]);
    assert.equal(r.totalMatches, 0);
    assert.equal(r.winRate, null);
    assert.equal(r.profitFactor, null);
  });

  test("win rate is 100% when all resolved are wins", () => {
    const matches = [
      { similarityScore: 90, outcome: "win", expectedRr: 2.0, traderConfidence: 80, traderNotes: null },
      { similarityScore: 85, outcome: "win", expectedRr: 1.5, traderConfidence: 70, traderNotes: null },
    ];
    const r = computeRecommendation(matches);
    assert.equal(r.winRate, 1.0);
    assert.equal(r.totalMatches, 2);
  });

  test("win rate is 0% when all resolved are losses", () => {
    const matches = [
      { similarityScore: 90, outcome: "loss", expectedRr: 2.0, traderConfidence: 60, traderNotes: null },
    ];
    const r = computeRecommendation(matches);
    assert.equal(r.winRate, 0.0);
  });

  test("pending decisions excluded from win rate calculation", () => {
    const matches = [
      { similarityScore: 90, outcome: "win", expectedRr: 2.0, traderConfidence: 80, traderNotes: null },
      { similarityScore: 80, outcome: "pending", expectedRr: 2.0, traderConfidence: 75, traderNotes: null },
    ];
    const r = computeRecommendation(matches);
    assert.equal(r.winRate, 1.0); // only 1 resolved, 1 win
  });

  test("avgRr computed correctly", () => {
    const matches = [
      { similarityScore: 90, outcome: "win", expectedRr: 2.0, traderConfidence: 80, traderNotes: null },
      { similarityScore: 85, outcome: "loss", expectedRr: 3.0, traderConfidence: 70, traderNotes: null },
    ];
    const r = computeRecommendation(matches);
    assert.equal(r.avgRr, 2.5);
  });

  test("avgConfidence computed correctly", () => {
    const matches = [
      { similarityScore: 90, outcome: "win", expectedRr: 2.0, traderConfidence: 80, traderNotes: null },
      { similarityScore: 85, outcome: "win", expectedRr: 2.0, traderConfidence: 60, traderNotes: null },
    ];
    const r = computeRecommendation(matches);
    assert.equal(r.avgConfidence, 70);
  });

  test("winRate is null when no resolved decisions", () => {
    const matches = [
      { similarityScore: 80, outcome: "pending", expectedRr: 2.0, traderConfidence: 70, traderNotes: null },
      { similarityScore: 75, outcome: null, expectedRr: 2.0, traderConfidence: 65, traderNotes: null },
    ];
    const r = computeRecommendation(matches);
    assert.equal(r.winRate, null);
  });
});

// ─── Report content generation ─────────────────────────────────────────────

function generateReportContent(stats: {
  total: number;
  accepted: number;
  rejected: number;
  delayed: number;
  wins: number;
  losses: number;
  withOutcome: number;
  agreements: number;
  withBoth: number;
  avgConfidence: number | null;
}): string {
  const winRate = stats.withOutcome > 0 ? ((stats.wins / stats.withOutcome) * 100).toFixed(1) : "N/A";
  const agreementRate = stats.withBoth > 0 ? ((stats.agreements / stats.withBoth) * 100).toFixed(1) : "N/A";
  return `Total: ${stats.total}, Accepted: ${stats.accepted}, WinRate: ${winRate}%, Agreement: ${agreementRate}%`;
}

describe("report content generation", () => {
  test("produces correct win rate string", () => {
    const result = generateReportContent({
      total: 10, accepted: 7, rejected: 3, delayed: 0,
      wins: 5, losses: 2, withOutcome: 7,
      agreements: 6, withBoth: 8,
      avgConfidence: 72,
    });
    assert.ok(result.includes("WinRate: 71.4%"));
  });

  test("shows N/A when no outcomes", () => {
    const result = generateReportContent({
      total: 5, accepted: 5, rejected: 0, delayed: 0,
      wins: 0, losses: 0, withOutcome: 0,
      agreements: 0, withBoth: 0,
      avgConfidence: null,
    });
    assert.ok(result.includes("WinRate: N/A"));
    assert.ok(result.includes("Agreement: N/A"));
  });
});
