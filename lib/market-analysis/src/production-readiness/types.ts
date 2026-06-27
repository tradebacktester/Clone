export interface Finding {
  level: "critical" | "warn" | "info";
  message: string;
}

export interface StageResult {
  id: number;
  name: string;
  status: "pass" | "warn" | "fail" | "skip" | "running";
  score: number;
  findings: Finding[];
  blockers: string[];
  durationMs: number;
  details: Record<string, unknown>;
}

export interface CategoryScores {
  architecture: number;
  strategy: number;
  testing: number;
  dataQuality: number;
  riskManagement: number;
  performance: number;
  reliability: number;
}

export interface PipelineResult {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  overallScore: number;
  verdict: "production-ready" | "needs-work" | "not-ready";
  stages: StageResult[];
  categoryScores: CategoryScores;
  criticalBlockers: string[];
  recommendations: string[];
  reportPath: string;
}

export interface StageProgress {
  id: number;
  name: string;
  status: StageResult["status"];
}

export interface PipelineStatus {
  status: "idle" | "running" | "complete" | "failed";
  currentStage: number;
  totalStages: number;
  startedAt?: string;
  completedAt?: string;
  stages: StageProgress[];
  error?: string;
}
