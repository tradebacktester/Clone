// ─── Decision Intelligence Engine — Public API ────────────────────────────────
// Advisory only — no trade execution, no strategy modification.

export type {
  CurrentSetup,
  TisComponent,
  TisComponentKey,
  RecommendationLevel,
  EvidenceFactor,
  SimilarExperience,
  UncertaintyLevel,
  DiReliabilityRating,
  TradeIntelligenceReport,
  ValidationFlag,
} from "./types.js";

export {
  TIS_WEIGHTS,
  RECOMMENDATION_LEVELS,
  DI_ENGINE_VERSION,
  MIN_EVIDENCE_FOR_RECOMMENDATION,
  MAX_SIMILAR_EXPERIENCES,
  LOW_CONFIDENCE_THRESHOLD,
  SIMILARITY_THRESHOLD,
  tisToLevel,
  computeUncertaintyLevel,
  computeReliabilityRating,
} from "./types.js";

export { evaluateSetup, describeExpectancy } from "./recommendation-engine.js";
export { findSimilarExperiences, cosineSimilarity, buildVectorFromSetup, buildVectorFromExtracted } from "./historical-matcher.js";
export { computeTis } from "./setup-scorer.js";
export { extractFactors } from "./factor-analyzer.js";
export { computeRecommendationConfidence } from "./confidence-calculator.js";
export { diStore } from "./di-store.js";
export { generateMarkdownReport } from "./report-generator.js";
