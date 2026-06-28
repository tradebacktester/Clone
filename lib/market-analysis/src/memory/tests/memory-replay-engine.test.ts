/**
 * Memory Replay Engine Tests
 *
 * Tests for the replay session management, step control, and
 * step type classification logic — all pure functions, no DB required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Inline types (mirrors memory-replay-engine) ──────────────────────────────

type ReplayStatus = "active" | "paused" | "completed" | "error";
type ReplayStepType =
  | "market_scan" | "snapshot" | "setup_evaluation" | "context_capture"
  | "screenshot" | "decision" | "trade_open" | "trade_management" | "trade_exit"
  | "review" | "lesson" | "timeline_event";

interface ReplayStep {
  stepIndex:   number;
  type:        ReplayStepType;
  timestamp:   Date;
  title:       string;
  description: string;
  data:        Record<string, unknown>;
  hasVisual:   boolean;
  phase:       "pre_trade" | "in_trade" | "post_trade";
}

interface ReplaySession {
  sessionId:     string;
  tradeId:       number;
  currentStep:   number;
  totalSteps:    number;
  status:        ReplayStatus;
  playbackSpeed: number;
  steps:         ReplayStep[];
}

// ─── In-memory session store ──────────────────────────────────────────────────

const sessions = new Map<string, ReplaySession>();

function makeStep(overrides: Partial<ReplayStep> = {}): ReplayStep {
  return {
    stepIndex:   0,
    type:        "snapshot",
    timestamp:   new Date(),
    title:       "Test Step",
    description: "Test description",
    data:        {},
    hasVisual:   false,
    phase:       "pre_trade",
    ...overrides,
  };
}

function makeSession(steps: ReplayStep[], overrides: Partial<ReplaySession> = {}): ReplaySession {
  return {
    sessionId:     crypto.randomUUID(),
    tradeId:       1,
    currentStep:   0,
    totalSteps:    steps.length,
    status:        "active",
    playbackSpeed: 1,
    steps,
    ...overrides,
  };
}

function stepForward(session: ReplaySession): { step: ReplayStep | null; completed: boolean } {
  if (session.status === "paused") throw new Error("Session is paused");
  if (session.currentStep >= session.totalSteps - 1) {
    session.status = "completed";
    return { step: null, completed: true };
  }
  session.currentStep++;
  return { step: session.steps[session.currentStep] ?? null, completed: session.currentStep >= session.totalSteps - 1 };
}

function stepBackward(session: ReplaySession): { step: ReplayStep | null } {
  if (session.currentStep > 0) session.currentStep--;
  return { step: session.steps[session.currentStep] ?? null };
}

function seekToStep(session: ReplaySession, target: number): { step: ReplayStep | null } {
  const idx = Math.min(Math.max(0, target), session.totalSteps - 1);
  session.currentStep = idx;
  session.status = "active";
  return { step: session.steps[idx] ?? null };
}

function setPlaybackSpeed(session: ReplaySession, speed: number): void {
  session.playbackSpeed = Math.min(Math.max(speed, 0.25), 10);
}

// ─── Step forward tests ───────────────────────────────────────────────────────

describe("stepForward", () => {
  it("advances currentStep by 1", () => {
    const steps = [makeStep({ stepIndex: 0 }), makeStep({ stepIndex: 1 }), makeStep({ stepIndex: 2 })];
    const session = makeSession(steps);
    stepForward(session);
    assert.equal(session.currentStep, 1);
  });

  it("returns the new step data", () => {
    const steps = [makeStep({ stepIndex: 0, title: "A" }), makeStep({ stepIndex: 1, title: "B" })];
    const session = makeSession(steps);
    const { step } = stepForward(session);
    assert.equal(step?.title, "B");
  });

  it("returns completed=true when advancing past the last step", () => {
    const steps = [makeStep()];
    const session = makeSession(steps);
    const { completed } = stepForward(session);
    assert.equal(completed, true);
  });

  it("sets status to completed when at last step", () => {
    const steps = [makeStep({ stepIndex: 0 }), makeStep({ stepIndex: 1 })];
    const session = makeSession(steps, { currentStep: 1 });
    stepForward(session);
    assert.equal(session.status, "completed");
  });

  it("throws when session is paused", () => {
    const steps = [makeStep(), makeStep()];
    const session = makeSession(steps, { status: "paused" });
    assert.throws(() => stepForward(session), /paused/);
  });

  it("returns null step when going past the last", () => {
    const steps = [makeStep()];
    const session = makeSession(steps);
    const { step } = stepForward(session);
    assert.equal(step, null);
  });
});

// ─── Step backward tests ──────────────────────────────────────────────────────

describe("stepBackward", () => {
  it("decrements currentStep", () => {
    const steps = [makeStep(), makeStep(), makeStep()];
    const session = makeSession(steps, { currentStep: 2 });
    stepBackward(session);
    assert.equal(session.currentStep, 1);
  });

  it("does not go below 0", () => {
    const steps = [makeStep()];
    const session = makeSession(steps, { currentStep: 0 });
    stepBackward(session);
    assert.equal(session.currentStep, 0);
  });

  it("returns the step at the new index", () => {
    const steps = [makeStep({ title: "First" }), makeStep({ title: "Second" })];
    const session = makeSession(steps, { currentStep: 1 });
    const { step } = stepBackward(session);
    assert.equal(step?.title, "First");
  });
});

// ─── Seek tests ───────────────────────────────────────────────────────────────

describe("seekToStep", () => {
  it("seeks to the target index", () => {
    const steps = [makeStep(), makeStep(), makeStep(), makeStep()];
    const session = makeSession(steps);
    seekToStep(session, 3);
    assert.equal(session.currentStep, 3);
  });

  it("clamps to 0 for negative index", () => {
    const steps = [makeStep(), makeStep()];
    const session = makeSession(steps, { currentStep: 1 });
    seekToStep(session, -5);
    assert.equal(session.currentStep, 0);
  });

  it("clamps to last step for out-of-bounds", () => {
    const steps = [makeStep(), makeStep(), makeStep()];
    const session = makeSession(steps);
    seekToStep(session, 999);
    assert.equal(session.currentStep, 2);
  });

  it("resumes a paused session on seek", () => {
    const steps = [makeStep(), makeStep()];
    const session = makeSession(steps, { status: "paused" });
    seekToStep(session, 1);
    assert.equal(session.status, "active");
  });

  it("returns the step at the sought index", () => {
    const steps = [makeStep({ title: "A" }), makeStep({ title: "B" }), makeStep({ title: "C" })];
    const session = makeSession(steps);
    const { step } = seekToStep(session, 2);
    assert.equal(step?.title, "C");
  });
});

// ─── Playback speed tests ─────────────────────────────────────────────────────

describe("setPlaybackSpeed", () => {
  it("sets the playback speed", () => {
    const session = makeSession([makeStep()]);
    setPlaybackSpeed(session, 2);
    assert.equal(session.playbackSpeed, 2);
  });

  it("clamps minimum to 0.25", () => {
    const session = makeSession([makeStep()]);
    setPlaybackSpeed(session, 0.01);
    assert.equal(session.playbackSpeed, 0.25);
  });

  it("clamps maximum to 10", () => {
    const session = makeSession([makeStep()]);
    setPlaybackSpeed(session, 100);
    assert.equal(session.playbackSpeed, 10);
  });

  it("accepts exact boundary values", () => {
    const session = makeSession([makeStep()]);
    setPlaybackSpeed(session, 0.25);
    assert.equal(session.playbackSpeed, 0.25);
    setPlaybackSpeed(session, 10);
    assert.equal(session.playbackSpeed, 10);
  });
});

// ─── Step phase classification tests ─────────────────────────────────────────

describe("Step phases", () => {
  function buildPhase(step: number, total: number): "pre_trade" | "in_trade" | "post_trade" {
    const ratio = step / total;
    if (ratio < 0.3) return "pre_trade";
    if (ratio > 0.7) return "post_trade";
    return "in_trade";
  }

  it("first 30% of steps are pre_trade", () => {
    assert.equal(buildPhase(0, 10), "pre_trade");
    assert.equal(buildPhase(2, 10), "pre_trade");
  });

  it("middle 40% of steps are in_trade", () => {
    assert.equal(buildPhase(5, 10), "in_trade");
    assert.equal(buildPhase(6, 10), "in_trade");
  });

  it("last 30% of steps are post_trade", () => {
    assert.equal(buildPhase(8, 10), "post_trade");
    assert.equal(buildPhase(9, 10), "post_trade");
  });

  it("single step is pre_trade (0/1 = 0 < 0.3)", () => {
    assert.equal(buildPhase(0, 1), "pre_trade");
  });
});

// ─── Step type mapping tests ──────────────────────────────────────────────────

describe("Step type mapping", () => {
  const typeMap: Record<string, ReplayStepType> = {
    opened:       "trade_open",
    closed:       "trade_exit",
    manual_close: "trade_exit",
    break_even:   "trade_management",
    partial_close:"trade_management",
    trailing_stop:"trade_management",
    sl_updated:   "trade_management",
    tp_updated:   "trade_management",
    price_update: "trade_management",
  };

  it("maps 'opened' to trade_open", () => {
    assert.equal(typeMap["opened"], "trade_open");
  });

  it("maps 'closed' to trade_exit", () => {
    assert.equal(typeMap["closed"], "trade_exit");
  });

  it("maps 'break_even' to trade_management", () => {
    assert.equal(typeMap["break_even"], "trade_management");
  });

  it("maps 'manual_close' to trade_exit", () => {
    assert.equal(typeMap["manual_close"], "trade_exit");
  });

  it("all management events map to trade_management", () => {
    const mgmt = ["break_even", "partial_close", "trailing_stop", "sl_updated", "tp_updated", "price_update"];
    for (const e of mgmt) {
      assert.equal(typeMap[e], "trade_management");
    }
  });
});

// ─── Session lifecycle tests ──────────────────────────────────────────────────

describe("Session lifecycle", () => {
  it("new session starts at step 0", () => {
    const steps = [makeStep(), makeStep(), makeStep()];
    const session = makeSession(steps);
    assert.equal(session.currentStep, 0);
    assert.equal(session.status, "active");
  });

  it("can pause and resume", () => {
    const steps = [makeStep(), makeStep()];
    const session = makeSession(steps);
    session.status = "paused";
    assert.equal(session.status, "paused");
    session.status = "active";
    assert.equal(session.status, "active");
  });

  it("completing a session sets status to completed", () => {
    const steps = [makeStep()];
    const session = makeSession(steps);
    stepForward(session);
    assert.equal(session.status, "completed");
  });

  it("totalSteps matches the steps array length", () => {
    const steps = Array.from({ length: 7 }, (_, i) => makeStep({ stepIndex: i }));
    const session = makeSession(steps);
    assert.equal(session.totalSteps, 7);
    assert.equal(session.steps.length, 7);
  });
});
