import {
  SimulationResultSchema,
  type SimulationResultT,
  type NodeT,
  type EdgeT,
} from "#shared";
import { callStructured, MODELS, type UsageTracker } from "../../lib/anthropic.js";
import { loadPrompt } from "../prompts.js";

const SIMULATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["edges"],
  properties: {
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "fromNodeId", "toNodeId", "kind", "rationale", "evidence"],
        properties: {
          id: { type: "string" },
          fromNodeId: { type: "string" },
          toNodeId: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "depends_on",
              "produces_for",
              "influences",
              "conflicts",
              "precedes",
              "relates",
            ],
          },
          rationale: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
  },
};

export interface SimulateOptions {
  model?: string;
  tracker?: UsageTracker;
}

export interface SimulateOutcome {
  result: SimulationResultT;
  /** Edges referencing unknown ids or self-loops. */
  dropped: EdgeT[];
  /** Edges dropped because their `evidence` is not grounded in the source text. */
  ungrounded: EdgeT[];
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Is the edge's evidence quote actually present in the source text? Tolerant:
 * exact normalized containment first, then a contiguous-token-run check that
 * survives minor quote drift, then a high token-overlap fallback. Returns false
 * for evidence too short to be a real citation.
 */
export function isGrounded(evidence: string, normalizedSource: string): boolean {
  const e = normalizeText(evidence);
  if (e.length < 8) return false;
  if (normalizedSource.includes(e)) return true;

  const toks = e.split(" ").filter(Boolean);
  if (toks.length < 3) return false;

  // Allow dropping up to 2 tokens from each end (quote drift / added framing).
  for (let start = 0; start <= Math.min(2, toks.length - 3); start++) {
    for (let end = toks.length; end >= Math.max(start + 3, toks.length - 2); end--) {
      const sub = toks.slice(start, end).join(" ");
      if (sub.length >= 12 && normalizedSource.includes(sub)) return true;
    }
  }

  // Fallback: nearly all evidence tokens present in the source (reordered quote).
  const srcTokens = new Set(normalizedSource.split(" "));
  const overlap = toks.filter((t) => srcTokens.has(t)).length / toks.length;
  return overlap >= 0.9;
}

const STOP = new Set([
  "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "is", "are",
  "it", "its", "by", "with", "that", "this", "as", "at", "from", "into", "be",
]);

function labelTokens(label: string): string[] {
  return normalizeText(label)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * Does the evidence quote actually reference BOTH endpoints? A quote that
 * describes an interaction names both concepts; a definition that merely
 * mentions one (or neither) does not. This is what separates a real
 * relationship from co-occurrence — the primary glossary-fabrication killer.
 */
export function evidenceLinksBoth(evidence: string, fromLabel: string, toLabel: string): boolean {
  const ev = normalizeText(evidence);
  const hit = (label: string) => {
    const toks = labelTokens(label);
    if (!toks.length) return true; // nothing to check against
    return toks.some((t) => ev.includes(t));
  };
  return hit(fromLabel) && hit(toLabel);
}

/**
 * Generate the most significant relationships between the given nodes, grounded
 * in `sourceText`. Validates against the schema, drops edges with unknown
 * endpoints, then drops edges whose evidence is not found in the source.
 */
export async function simulateRelationships(
  nodes: NodeT[],
  sourceText: string,
  opts: SimulateOptions = {},
): Promise<SimulateOutcome> {
  const system = loadPrompt("simulation");
  const nodeList = nodes
    .map((n) => `${n.id} ${n.label} — ${n.description}`)
    .join("\n");

  const userText = [
    "Identify the most significant relationships between these concepts.",
    "Every edge must cite a verbatim quote from the SOURCE TEXT in its `evidence` field.",
    "Use only these exact ids in fromNodeId / toNodeId.",
    "",
    "SOURCE TEXT:",
    '"""',
    sourceText,
    '"""',
    "",
    "NODES:",
    nodeList,
  ].join("\n");

  const raw = await callStructured({
    model: opts.model ?? MODELS.haiku,
    cachedSystem: system,
    userText,
    jsonSchema: SIMULATION_JSON_SCHEMA,
    schema: SimulationResultSchema,
    schemaName: "SimulationResult",
    maxTokens: 4096,
    tracker: opts.tracker,
  });

  const ids = new Set(nodes.map((n) => n.id));
  const labelById = new Map(nodes.map((n) => [n.id, n.label]));
  const normalizedSource = normalizeText(sourceText);
  const valid: EdgeT[] = [];
  const dropped: EdgeT[] = [];
  const ungrounded: EdgeT[] = [];
  for (const e of raw.edges) {
    const fromLabel = labelById.get(e.fromNodeId) ?? "";
    const toLabel = labelById.get(e.toNodeId) ?? "";
    if (!(ids.has(e.fromNodeId) && ids.has(e.toNodeId)) || e.fromNodeId === e.toNodeId) {
      dropped.push(e);
    } else if (
      !isGrounded(e.evidence, normalizedSource) ||
      !evidenceLinksBoth(e.evidence, fromLabel, toLabel)
    ) {
      // Evidence absent from source, or does not reference both concepts → not a
      // described interaction (co-occurrence / definition citation).
      ungrounded.push(e);
    } else {
      valid.push(e);
    }
  }

  return { result: { edges: valid }, dropped, ungrounded };
}
