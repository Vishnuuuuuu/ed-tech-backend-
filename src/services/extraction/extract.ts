import { ExtractionResultSchema, type ExtractionResultT } from "#shared";
import { callStructured, MODELS, type UsageTracker } from "../../lib/anthropic.js";
import { loadPrompt } from "../prompts.js";

const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["rootLabel", "nodes"],
  properties: {
    rootLabel: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "description", "parentId"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          parentId: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
};

export interface ExtractOptions {
  model?: string;
  tracker?: UsageTracker;
  /** Cap document text to control cost/latency (risk: LLM cost per upload). */
  maxChars?: number;
}

/**
 * Extract a structured concept map from already-extracted document text.
 * Validates against ExtractionResultSchema (callStructured retries once on
 * invalid output, then throws).
 */
export async function extractConceptMap(
  text: string,
  opts: ExtractOptions = {},
): Promise<ExtractionResultT> {
  const system = loadPrompt("extraction");
  const maxChars = opts.maxChars ?? 12_000;
  const docText = text.length > maxChars ? text.slice(0, maxChars) : text;

  const userText = [
    "Extract the concept map from the following study material.",
    "",
    "DOCUMENT:",
    '"""',
    docText,
    '"""',
  ].join("\n");

  return callStructured({
    model: opts.model ?? MODELS.haiku,
    cachedSystem: system,
    userText,
    jsonSchema: EXTRACTION_JSON_SCHEMA,
    schema: ExtractionResultSchema,
    schemaName: "ExtractionResult",
    maxTokens: 4096,
    tracker: opts.tracker,
  });
}
