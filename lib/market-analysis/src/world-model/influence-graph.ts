// ─── Market Influence Graph ───────────────────────────────────────────────────
// Builds a directed influence graph showing how market components affect each other.
// Derives edges from computed relationships + domain knowledge priors.
// Observational only — no trade execution, no strategy modification.

import type {
  WorldModelComponent,
  ComponentRelationship,
  InfluenceEdge,
  InfluenceGraph,
  InfluenceNode,
  InfluenceDirection,
} from "./types.js";
import { ALL_COMPONENTS, COMPONENT_LABELS, WORLD_MODEL_VERSION } from "./types.js";

// ─── Domain Prior Edges ────────────────────────────────────────────────────────
// Documented market microstructure relationships used when data is insufficient.

interface PriorEdge {
  source: WorldModelComponent;
  target: WorldModelComponent;
  strength: number;
  direction: InfluenceDirection;
  explanation: string;
}

const DOMAIN_PRIOR_EDGES: PriorEdge[] = [
  {
    source: "news",
    target: "volatility",
    strength: 0.8,
    direction: "positive",
    explanation: "High-impact news events consistently increase short-term volatility.",
  },
  {
    source: "volatility",
    target: "liquidity",
    strength: 0.65,
    direction: "negative",
    explanation: "Rising volatility typically causes market makers to widen spreads and reduce order book depth.",
  },
  {
    source: "liquidity",
    target: "spread",
    strength: 0.72,
    direction: "negative",
    explanation: "Lower liquidity forces wider bid-ask spreads as market makers price in risk.",
  },
  {
    source: "spread",
    target: "confirmation_quality",
    strength: 0.55,
    direction: "negative",
    explanation: "Wider spreads increase slippage cost, reducing entry confirmation reliability.",
  },
  {
    source: "regime",
    target: "trend",
    strength: 0.85,
    direction: "positive",
    explanation: "Market regime defines the broad directional context for trend analysis.",
  },
  {
    source: "trend",
    target: "supply_demand",
    strength: 0.70,
    direction: "positive",
    explanation: "Strong trends create directional imbalances between supply and demand zones.",
  },
  {
    source: "supply_demand",
    target: "amd_completion",
    strength: 0.62,
    direction: "positive",
    explanation: "High-quality supply/demand zones are prerequisites for clean AMD cycles.",
  },
  {
    source: "amd_completion",
    target: "confirmation_quality",
    strength: 0.68,
    direction: "positive",
    explanation: "Complete AMD cycles provide the structural confirmation needed for high-quality entries.",
  },
  {
    source: "session",
    target: "liquidity",
    strength: 0.75,
    direction: "positive",
    explanation: "Institutional sessions (London/NY) drive higher liquidity; off-hours reduce it.",
  },
  {
    source: "session",
    target: "volatility",
    strength: 0.60,
    direction: "positive",
    explanation: "Active sessions produce higher average volatility due to institutional order flow.",
  },
  {
    source: "correlation",
    target: "trend",
    strength: 0.55,
    direction: "mixed",
    explanation: "Correlation breakdowns between pairs often precede or accompany major directional moves.",
  },
  {
    source: "liquidity_sweeps",
    target: "supply_demand",
    strength: 0.65,
    direction: "positive",
    explanation: "Liquidity sweeps rebalance supply/demand zones and often mark key reversal levels.",
  },
  {
    source: "volatility",
    target: "market_structure",
    strength: 0.58,
    direction: "mixed",
    explanation: "High volatility can accelerate market structure breaks or trigger false breakouts.",
  },
  {
    source: "news",
    target: "spread",
    strength: 0.70,
    direction: "positive",
    explanation: "News events cause brokers to widen spreads as a risk management measure.",
  },
  {
    source: "market_structure",
    target: "trend",
    strength: 0.78,
    direction: "positive",
    explanation: "Break-of-structure events mark the beginning of new trend phases.",
  },
  {
    source: "regime",
    target: "amd_completion",
    strength: 0.60,
    direction: "positive",
    explanation: "Trending regimes produce cleaner, more complete AMD cycles than ranging markets.",
  },
];

// ─── Edge Builder ─────────────────────────────────────────────────────────────

function strengthToDirection(strength: number): InfluenceDirection {
  if (strength > 0.1) return "positive";
  if (strength < -0.1) return "negative";
  return "mixed";
}

export function buildInfluenceGraph(
  relationships: ComponentRelationship[],
  usePriors = true,
): InfluenceGraph {
  const now = new Date();
  const edgeMap = new Map<string, InfluenceEdge>();

  // Add data-derived edges
  for (const rel of relationships) {
    const key = `${rel.sourceComponent}→${rel.targetComponent}`;
    const existing = edgeMap.get(key);

    const edge: InfluenceEdge = {
      sourceNode: rel.sourceComponent,
      targetNode: rel.targetComponent,
      influenceStrength: Math.abs(rel.strength),
      influenceDirection: strengthToDirection(rel.strength),
      confidence: rel.confidence,
      sampleSize: rel.sampleSize,
      propagationDepth: 1,
      explanation: rel.evidenceSummary,
      supportingEvidence: rel.historicalEvidence,
    };

    if (!existing || edge.confidence > existing.confidence) {
      edgeMap.set(key, edge);
    }
  }

  // Fill gaps with domain priors (only if no data-derived edge exists)
  if (usePriors) {
    for (const prior of DOMAIN_PRIOR_EDGES) {
      const key = `${prior.source}→${prior.target}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          sourceNode: prior.source,
          targetNode: prior.target,
          influenceStrength: prior.strength,
          influenceDirection: prior.direction,
          confidence: 50, // prior = moderate confidence
          sampleSize: 0,
          propagationDepth: 1,
          explanation: `[Domain Prior] ${prior.explanation}`,
          supportingEvidence: [],
        });
      }
    }
  }

  const edges = Array.from(edgeMap.values())
    .filter(e => e.influenceStrength >= 0.1)
    .sort((a, b) => b.influenceStrength - a.influenceStrength);

  // Compute indirect (depth-2) edges
  const depth2 = computeDepth2Edges(edges);
  const allEdges = [...edges, ...depth2];

  // Build node statistics
  const nodes = buildNodes(allEdges);

  return {
    nodes,
    edges: allEdges,
    computedAt: now,
    version: WORLD_MODEL_VERSION,
    totalSampleSize: relationships.reduce((sum, r) => sum + r.sampleSize, 0),
  };
}

// ─── Indirect Edge Propagation ────────────────────────────────────────────────

function computeDepth2Edges(directEdges: InfluenceEdge[]): InfluenceEdge[] {
  const indirect: InfluenceEdge[] = [];
  const directSet = new Set(directEdges.map(e => `${e.sourceNode}→${e.targetNode}`));

  for (const e1 of directEdges) {
    for (const e2 of directEdges) {
      if (e1.targetNode !== e2.sourceNode) continue;
      // Prevent self-loops (A→B→A would create A→A)
      if (e1.sourceNode === e2.targetNode) continue;
      const key = `${e1.sourceNode}→${e2.targetNode}`;
      if (directSet.has(key)) continue; // direct already exists

      const propagatedStrength = e1.influenceStrength * e2.influenceStrength * 0.7;
      if (propagatedStrength < 0.15) continue;

      const dir: InfluenceDirection =
        e1.influenceDirection === e2.influenceDirection &&
        e1.influenceDirection !== "mixed"
          ? e1.influenceDirection
          : "mixed";

      indirect.push({
        sourceNode: e1.sourceNode,
        targetNode: e2.targetNode,
        influenceStrength: parseFloat(propagatedStrength.toFixed(4)),
        influenceDirection: dir,
        confidence: Math.min(e1.confidence, e2.confidence) * 0.6,
        sampleSize: Math.min(e1.sampleSize, e2.sampleSize),
        propagationDepth: 2,
        explanation: `Indirect: ${e1.sourceNode} → ${e1.targetNode} → ${e2.targetNode}`,
        supportingEvidence: [],
      });
    }
  }

  return indirect;
}

// ─── Node Builder ─────────────────────────────────────────────────────────────

function buildNodes(edges: InfluenceEdge[]): InfluenceNode[] {
  const inDegree = new Map<WorldModelComponent, number>();
  const outDegree = new Map<WorldModelComponent, number>();

  for (const comp of ALL_COMPONENTS) {
    inDegree.set(comp, 0);
    outDegree.set(comp, 0);
  }

  for (const edge of edges.filter(e => e.propagationDepth === 1)) {
    inDegree.set(edge.targetNode, (inDegree.get(edge.targetNode) ?? 0) + 1);
    outDegree.set(edge.sourceNode, (outDegree.get(edge.sourceNode) ?? 0) + 1);
  }

  const maxDegree = Math.max(
    ...ALL_COMPONENTS.map(c => (inDegree.get(c) ?? 0) + (outDegree.get(c) ?? 0)),
    1,
  );

  return ALL_COMPONENTS.map(comp => {
    const ins = inDegree.get(comp) ?? 0;
    const outs = outDegree.get(comp) ?? 0;
    return {
      component: comp,
      label: COMPONENT_LABELS[comp],
      inDegree: ins,
      outDegree: outs,
      centralityScore: parseFloat((((ins + outs) / maxDegree) * 100).toFixed(1)),
    };
  }).sort((a, b) => b.centralityScore - a.centralityScore);
}

// ─── Graph Queries ────────────────────────────────────────────────────────────

export function getInfluencedBy(
  component: WorldModelComponent,
  graph: InfluenceGraph,
  directOnly = true,
): InfluenceEdge[] {
  return graph.edges.filter(
    e => e.targetNode === component &&
      (!directOnly || e.propagationDepth === 1),
  );
}

export function getInfluences(
  component: WorldModelComponent,
  graph: InfluenceGraph,
  directOnly = true,
): InfluenceEdge[] {
  return graph.edges.filter(
    e => e.sourceNode === component &&
      (!directOnly || e.propagationDepth === 1),
  );
}

export function getTopInfluencers(
  graph: InfluenceGraph,
  limit = 5,
): InfluenceNode[] {
  return [...graph.nodes]
    .sort((a, b) => b.centralityScore - a.centralityScore)
    .slice(0, limit);
}

export function buildInfluenceChain(
  start: WorldModelComponent,
  graph: InfluenceGraph,
  maxDepth = 4,
): Array<{ path: WorldModelComponent[]; cumulativeStrength: number }> {
  const results: Array<{ path: WorldModelComponent[]; cumulativeStrength: number }> = [];

  function dfs(current: WorldModelComponent, path: WorldModelComponent[], strength: number) {
    if (path.length > maxDepth) return;
    const outgoing = graph.edges.filter(
      e => e.sourceNode === current && e.propagationDepth === 1 && !path.includes(e.targetNode),
    );
    for (const edge of outgoing) {
      const newStrength = strength * edge.influenceStrength;
      const newPath = [...path, edge.targetNode];
      results.push({ path: newPath, cumulativeStrength: parseFloat(newStrength.toFixed(4)) });
      dfs(edge.targetNode, newPath, newStrength);
    }
  }

  dfs(start, [start], 1);
  return results.sort((a, b) => b.cumulativeStrength - a.cumulativeStrength).slice(0, 20);
}
