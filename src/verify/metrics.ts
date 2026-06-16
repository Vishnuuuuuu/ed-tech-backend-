import type { EdgeT, ExtractionResultT, NodeT } from "#shared";
import type { Fixture } from "./fixtures.js";

export interface RunOutput {
  extraction: ExtractionResultT;
  edges: EdgeT[];
  droppedEdges: number;
  ungroundedEdges?: number;
}

export interface RunScore {
  nodesReturned: number;
  edgesReturned: number;
  matchedExpected: number;
  totalExpected: number;
  conceptRecall: number;
  hallucinations: number;
  hallucinationRate: number;
  hierarchyCorrect: number;
  hierarchyScored: number;
  hierarchyAccuracy: number;
  relValid: number;
  relTotal: number;
  relValidity: number | null;
  priceDemandConflict?: boolean;
  adversarial?: {
    fabricatedHierarchy: boolean;
    tooManyEdges: boolean;
    dishonestEdges: boolean;
    pass: boolean;
    notes: string[];
  };
  notes: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function termsMatch(nodeNorm: string, term: string): boolean {
  const t = normalize(term);
  if (t.length < 3) return nodeNorm === t;
  if (nodeNorm === t) return true;
  // word-boundary containment either direction
  return (
    new RegExp(`\\b${t.replace(/\s+/g, "\\s+")}\\b`).test(nodeNorm) ||
    new RegExp(`\\b${nodeNorm.replace(/\s+/g, "\\s+")}\\b`).test(t)
  );
}

/** Canonical concept label a node matches, or null. Used for recall/hallucination. */
function conceptOf(nodeLabel: string, fixture: Fixture): string | null {
  const nodeNorm = normalize(nodeLabel);
  for (const e of fixture.expectedNodes) {
    const terms = [e.label, ...(e.synonyms ?? [])];
    if (terms.some((t) => termsMatch(nodeNorm, t))) return e.label;
  }
  return null;
}

/**
 * Concept resolver for edge validity only — also matches `extraConcepts`
 * (genuinely-valid concepts omitted from the recall list, e.g. ATP). Does NOT
 * affect recall or hallucination denominators.
 */
function conceptOfEdge(nodeLabel: string, fixture: Fixture): string | null {
  const direct = conceptOf(nodeLabel, fixture);
  if (direct) return direct;
  const nodeNorm = normalize(nodeLabel);
  for (const e of fixture.extraConcepts ?? []) {
    const terms = [e.label, ...(e.synonyms ?? [])];
    if (terms.some((t) => termsMatch(nodeNorm, t))) return e.label;
  }
  return null;
}

const ROOT_TARGET = "__ROOT__";

function isRoot(nodeLabel: string, fixture: Fixture): boolean {
  const n = normalize(nodeLabel);
  return fixture.rootLabels.some((r) => termsMatch(n, r));
}

function edgeValid(
  edge: EdgeT,
  conceptById: (id: string) => string | null,
  labelById: (id: string) => string,
  fixture: Fixture,
): boolean {
  const a = conceptById(edge.fromNodeId);
  let b = conceptById(edge.toNodeId);
  if (!a) return false;
  // Organelle→whole-cell functional edges: credit the root as a valid target.
  if (!b) {
    if (fixture.rootIsValidTarget && isRoot(labelById(edge.toNodeId), fixture)) {
      b = ROOT_TARGET;
    } else {
      return false;
    }
  }
  // An edge within a single concept (e.g. Demand -> "Quantity Demanded") is
  // definitional noise, not a relationship between concepts.
  if (a === b) return false;

  if (fixture.layerOrder) {
    const oa = fixture.layerOrder[a];
    const ob = fixture.layerOrder[b];
    if (oa != null && ob != null) {
      // each layer depends on the layer below it (higher index -> lower index)
      return edge.kind === "depends_on" && oa > ob;
    }
    if (a === "Encapsulation" || b === "Encapsulation") {
      // Encapsulation transforms data across layers ("header added going down,
      // stripped going up") — produces_for is a valid kind for that, too.
      return ["relates", "depends_on", "influences", "precedes", "produces_for"].includes(edge.kind);
    }
    return false;
  }

  for (const r of fixture.allowedRelations ?? []) {
    if (a === r.from && (r.to === "*" || b === r.to) && r.kinds.includes(edge.kind)) {
      return true;
    }
  }
  return false;
}

export function scoreRun(fixture: Fixture, out: RunOutput): RunScore {
  const nodes = out.extraction.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const labelById = (id: string) => byId.get(id)?.label ?? "";
  const conceptById = (id: string) => {
    const n = byId.get(id);
    return n ? conceptOfEdge(n.label, fixture) : null;
  };

  // --- recall ---
  const matchedConcepts = new Set<string>();
  for (const n of nodes) {
    const c = conceptOf(n.label, fixture);
    if (c) matchedConcepts.add(c);
  }
  const totalExpected = fixture.expectedNodes.length;
  const matchedExpected = matchedConcepts.size;
  const conceptRecall = totalExpected ? matchedExpected / totalExpected : 0;

  // --- hallucination ---
  let hallucinations = 0;
  for (const n of nodes) {
    if (!conceptOf(n.label, fixture) && !isRoot(n.label, fixture)) hallucinations++;
  }
  const hallucinationRate = nodes.length ? hallucinations / nodes.length : 0;

  // --- hierarchy (over recalled concepts) ---
  let hierarchyCorrect = 0;
  let hierarchyScored = 0;
  for (const e of fixture.expectedNodes) {
    const node = nodes.find((n) => conceptOf(n.label, fixture) === e.label);
    if (!node) continue;
    hierarchyScored++;
    const parentLabel = node.parentId ? labelById(node.parentId) : null;
    const parentIsRoot = parentLabel != null && isRoot(parentLabel, fixture);
    let ok = false;
    if (e.parent === null) ok = node.parentId == null;
    else if (e.parent === "root") ok = parentIsRoot;
    else if (e.parent === "root_or_null") ok = node.parentId == null || parentIsRoot;
    if (ok) hierarchyCorrect++;
  }
  const hierarchyAccuracy = hierarchyScored ? hierarchyCorrect / hierarchyScored : 0;

  // --- relationship validity ---
  let relValid = 0;
  for (const edge of out.edges) {
    if (edgeValid(edge, conceptById, labelById, fixture)) relValid++;
  }
  const relTotal = out.edges.length;
  const relValidity = relTotal ? relValid / relTotal : null;

  const notes: string[] = [];
  const score: RunScore = {
    nodesReturned: nodes.length,
    edgesReturned: out.edges.length,
    matchedExpected,
    totalExpected,
    conceptRecall,
    hallucinations,
    hallucinationRate,
    hierarchyCorrect,
    hierarchyScored,
    hierarchyAccuracy,
    relValid,
    relTotal,
    relValidity,
    notes,
  };

  // train_3: the inverse Price/Demand link must be `conflicts`
  if (fixture.requireConflictBetween) {
    const [x, y] = fixture.requireConflictBetween;
    score.priceDemandConflict = out.edges.some((edge) => {
      const a = conceptById(edge.fromNodeId);
      const b = conceptById(edge.toNodeId);
      const pair = new Set([a, b]);
      return pair.has(x) && pair.has(y) && edge.kind === "conflicts";
    });
    if (!score.priceDemandConflict) {
      notes.push(`${x}/${y} inverse relationship NOT marked as conflicts`);
    }
  }

  // --- adversarial behavior ---
  if (fixture.adversarial) {
    const a = fixture.adversarial;
    const internalParents = new Set(
      nodes.map((n) => n.parentId).filter((p): p is string => p != null),
    );
    const fabricatedHierarchy = internalParents.size > a.maxInternalParents;
    const tooManyEdges = out.edges.length > a.maxEdges;
    const dishonest = out.edges.filter((e) => a.forbiddenKinds.includes(e.kind));
    const dishonestEdges = dishonest.length > 0;
    const aNotes: string[] = [];
    if (fabricatedHierarchy)
      aNotes.push(`fabricated hierarchy (${internalParents.size} internal parents)`);
    if (tooManyEdges) aNotes.push(`too many edges (${out.edges.length} > ${a.maxEdges})`);
    if (dishonestEdges)
      aNotes.push(`dishonest edge kinds: ${dishonest.map((e) => e.kind).join(", ")}`);
    score.adversarial = {
      fabricatedHierarchy,
      tooManyEdges,
      dishonestEdges,
      pass: !fabricatedHierarchy && !tooManyEdges && !dishonestEdges,
      notes: aNotes,
    };
  }

  return score;
}

export interface InvalidEdgeInfo {
  from: string;
  to: string;
  kind: string;
  evidence: string;
  fromConcept: string | null;
  toConcept: string | null;
}

/** Edges the scorer counts as invalid, resolved to concept labels, for error analysis. */
export function listInvalidEdges(fixture: Fixture, out: RunOutput): InvalidEdgeInfo[] {
  const byId = new Map(out.extraction.nodes.map((n) => [n.id, n]));
  const conceptById = (id: string) => {
    const n = byId.get(id);
    return n ? conceptOfEdge(n.label, fixture) : null;
  };
  const labelById = (id: string) => byId.get(id)?.label ?? id;
  const result: InvalidEdgeInfo[] = [];
  for (const e of out.edges) {
    if (!edgeValid(e, conceptById, labelById, fixture)) {
      result.push({
        from: labelById(e.fromNodeId),
        to: labelById(e.toNodeId),
        kind: e.kind,
        evidence: e.evidence,
        fromConcept: conceptById(e.fromNodeId),
        toConcept: conceptById(e.toNodeId),
      });
    }
  }
  return result;
}

function avgPairwiseJaccard(sets: Set<string>[]): number {
  if (sets.length < 2) return 1;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i];
      const b = sets[j];
      const inter = [...a].filter((x) => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      sum += union ? inter / union : 1;
      pairs++;
    }
  }
  return pairs ? sum / pairs : 1;
}

/** Average pairwise Jaccard of normalized node-label sets across repeat runs. */
export function determinism(outputs: RunOutput[]): number {
  return avgPairwiseJaccard(
    outputs.map((o) => new Set(o.extraction.nodes.map((n) => normalize(n.label)))),
  );
}

/** Average pairwise Jaccard of edge sets (from→to:kind) across repeat runs. */
export function edgeDeterminism(edgeSets: EdgeT[][]): number {
  return avgPairwiseJaccard(
    edgeSets.map(
      (es) => new Set(es.map((e) => `${e.fromNodeId}->${e.toNodeId}:${e.kind}`)),
    ),
  );
}
