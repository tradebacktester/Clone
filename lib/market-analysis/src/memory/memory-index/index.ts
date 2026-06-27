// ─── Memory Index ──────────────────────────────────────────────────────────
// Index management utilities: key construction, bucket classification,
// and composite lookup key generation for the memory system.
// All AI learning modules use these keys to correlate records.

// ─── Score Bucketing ───────────────────────────────────────────────────────

export type ScoreBucket = "<70" | "70-79" | "80-89" | "90+";

export function scoreToScoreBucket(score: number): ScoreBucket {
  if (score < 70) return "<70";
  if (score < 80) return "70-79";
  if (score < 90) return "80-89";
  return "90+";
}

// ─── Cluster Key ───────────────────────────────────────────────────────────
// Composite key grouping similar setups for pattern learning.
// Format: z{zoneBucket}|l{liqBucket}|a{amdBucket}|c{confBucket}|s{session}

export interface ClusterKeyInput {
  zoneScore:          number;
  liquidityScore:     number;
  amdScore:           number;
  confirmationScore:  number;
  session:            string;
}

export function buildClusterKey(input: ClusterKeyInput): string {
  const z = scoreToScoreBucket(input.zoneScore);
  const l = scoreToScoreBucket(input.liquidityScore);
  const a = scoreToScoreBucket(input.amdScore);
  const c = scoreToScoreBucket(input.confirmationScore);
  const s = (input.session ?? "unknown").toLowerCase();
  return `z${z}|l${l}|a${a}|c${c}|s${s}`;
}

export function parseClusterKey(key: string): ClusterKeyInput | null {
  const match = key.match(/^z(.+)\|l(.+)\|a(.+)\|c(.+)\|s(.+)$/);
  if (!match) return null;

  const bucketToMidpoint = (b: string): number => {
    switch (b) {
      case "<70":  return 65;
      case "70-79": return 75;
      case "80-89": return 85;
      case "90+":  return 95;
      default:     return 0;
    }
  };

  return {
    zoneScore:         bucketToMidpoint(match[1]),
    liquidityScore:    bucketToMidpoint(match[2]),
    amdScore:          bucketToMidpoint(match[3]),
    confirmationScore: bucketToMidpoint(match[4]),
    session:           match[5],
  };
}

// ─── Snapshot Reference Key ────────────────────────────────────────────────
// Deterministic key for market snapshots to detect near-duplicate captures.
// Format: {pair}|{session}|{bucket_timestamp}

export function buildSnapshotRefKey(pair: string, session: string, capturedAt: Date): string {
  // Round to nearest 15-minute bucket to deduplicate near-simultaneous captures
  const bucketMs = 15 * 60 * 1000;
  const bucket = Math.floor(capturedAt.getTime() / bucketMs) * bucketMs;
  return `${pair.toUpperCase()}|${session.toLowerCase()}|${bucket}`;
}

// ─── Setup Identity Key ────────────────────────────────────────────────────
// Detects duplicate setup submissions within a short time window.

export interface SetupIdentityInput {
  pair:      string;
  direction: string;
  session:   string;
  evaluatedAt: Date;
}

export function buildSetupIdentityKey(input: SetupIdentityInput): string {
  const bucketMs = 5 * 60 * 1000;
  const bucket = Math.floor(input.evaluatedAt.getTime() / bucketMs) * bucketMs;
  return `${input.pair}|${input.direction}|${input.session}|${bucket}`;
}

// ─── Search Filter Key ─────────────────────────────────────────────────────
// Builds a normalized cache key for search queries.

export interface SearchFilterInput {
  pair?:      string;
  direction?: string;
  session?:   string;
  regime?:    string;
  dateFrom?:  string;
  dateTo?:    string;
  limit?:     number;
  offset?:    number;
}

export function buildSearchCacheKey(prefix: string, filters: SearchFilterInput): string {
  const parts = [prefix];
  if (filters.pair)      parts.push(`p:${filters.pair}`);
  if (filters.direction) parts.push(`d:${filters.direction}`);
  if (filters.session)   parts.push(`s:${filters.session}`);
  if (filters.regime)    parts.push(`r:${filters.regime}`);
  if (filters.dateFrom)  parts.push(`from:${filters.dateFrom}`);
  if (filters.dateTo)    parts.push(`to:${filters.dateTo}`);
  if (filters.limit)     parts.push(`lim:${filters.limit}`);
  if (filters.offset)    parts.push(`off:${filters.offset}`);
  return parts.join("|");
}

// ─── Sorted Score Composite ────────────────────────────────────────────────
// Composite sort score for ranking setups in search results.

export interface ScoredRecord {
  zoneScore?:         number | string | null;
  liquidityScore?:    number | string | null;
  amdScore?:          number | string | null;
  confirmationScore?: number | string | null;
  confidence?:        number | string | null;
}

export function computeCompositeScore(record: ScoredRecord): number {
  const z = Number(record.zoneScore ?? 0);
  const l = Number(record.liquidityScore ?? 0);
  const a = Number(record.amdScore ?? 0);
  const c = Number(record.confirmationScore ?? 0);
  const conf = Number(record.confidence ?? 0);
  return (z * 0.25) + (l * 0.20) + (a * 0.25) + (c * 0.20) + (conf * 0.10);
}
