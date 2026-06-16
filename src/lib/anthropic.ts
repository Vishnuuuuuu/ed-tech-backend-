import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * Thin wrapper around the Anthropic SDK for the extraction/simulation pipeline.
 *
 * - Structured output via `output_config.format` (zod schema) so every model
 *   response is schema-validated before use.
 * - Prompt caching on the static system + few-shot block (the part that repeats
 *   on every call) — the main cost control for the tuning loop.
 * - One automatic repair retry on invalid output, then fail with a clear error.
 * - Per-model token + cost accounting for the verification report.
 */

export const MODELS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// $ per 1M tokens (input / output). Cache read ≈ 0.1× input; cache write ≈ 1.25× input.
const PRICING: Record<string, { input: number; output: number }> = {
  [MODELS.haiku]: { input: 1.0, output: 5.0 },
  [MODELS.sonnet]: { input: 3.0, output: 15.0 },
};

export interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

function costFor(model: string, u: Omit<CallUsage, "model" | "costUsd">): number {
  const p = PRICING[model] ?? { input: 0, output: 0 };
  return (
    (u.inputTokens * p.input +
      u.cacheCreationTokens * p.input * 1.25 +
      u.cacheReadTokens * p.input * 0.1 +
      u.outputTokens * p.output) /
    1_000_000
  );
}

/** Accumulates token usage + cost across an entire run for reporting. */
export class UsageTracker {
  private calls: CallUsage[] = [];

  record(model: string, usage: Anthropic.Messages.Usage | undefined): CallUsage {
    const entry: CallUsage = {
      model,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
      costUsd: 0,
    };
    entry.costUsd = costFor(model, entry);
    this.calls.push(entry);
    return entry;
  }

  summary() {
    const byModel: Record<
      string,
      { calls: number; inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number; costUsd: number }
    > = {};
    for (const c of this.calls) {
      const m = (byModel[c.model] ??= {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0,
      });
      m.calls += 1;
      m.inputTokens += c.inputTokens;
      m.outputTokens += c.outputTokens;
      m.cacheCreationTokens += c.cacheCreationTokens;
      m.cacheReadTokens += c.cacheReadTokens;
      m.costUsd += c.costUsd;
    }
    const totalCost = this.calls.reduce((s, c) => s + c.costUsd, 0);
    return { byModel, totalCost, totalCalls: this.calls.length };
  }
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to backend/.env before running the pipeline.",
      );
    }
    _client = new Anthropic();
  }
  return _client;
}

export interface StructuredCallOptions<T extends z.ZodTypeAny> {
  model: string;
  /** Static instruction + few-shot block. Cached (cache_control: ephemeral). */
  cachedSystem: string;
  /** Volatile per-request content (document text, node set, ...). Not cached. */
  userText: string;
  /** JSON Schema sent to the model to constrain output. */
  jsonSchema: Record<string, unknown>;
  /** Zod schema used to validate (and type) the parsed result. */
  schema: T;
  schemaName: string;
  maxTokens?: number;
  tracker?: UsageTracker;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

/**
 * Call a model with structured (JSON-Schema-constrained) output and prompt
 * caching, then validate the result against the zod contract. Retries once
 * with a repair instruction on invalid output, then throws.
 */
export async function callStructured<T extends z.ZodTypeAny>(
  opts: StructuredCallOptions<T>,
): Promise<z.infer<T>> {
  const c = client();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const userText =
      attempt === 0
        ? opts.userText
        : `${opts.userText}\n\nYour previous response was not valid JSON matching the required schema. Return ONLY a JSON object that exactly matches the schema — no prose, no markdown fences.`;

    try {
      const response = await c.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: 0,
        system: [
          {
            type: "text",
            text: opts.cachedSystem,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userText }],
        output_config: {
          format: {
            type: "json_schema",
            schema: opts.jsonSchema,
          },
        },
      } as Anthropic.MessageCreateParamsNonStreaming);

      opts.tracker?.record(opts.model, response.usage);

      const raw = textOf(response).trim();
      const parsed = opts.schema.parse(JSON.parse(raw));
      return parsed as z.infer<T>;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Structured call failed after retry for schema "${opts.schemaName}": ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
