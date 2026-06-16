import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promptsDir } from "../lib/repo.js";

const MARKER = "---SYSTEM---";

/**
 * Load the cacheable system+few-shot block for a pipeline prompt. The prompt
 * markdown lives in prompts/<name>.md; everything after the ---SYSTEM---
 * marker is the static content sent (and cached) on every model call.
 */
export function loadPrompt(name: "extraction" | "simulation"): string {
  const raw = readFileSync(join(promptsDir, `${name}.md`), "utf8");
  const idx = raw.indexOf(MARKER);
  if (idx === -1) {
    throw new Error(`prompt "${name}" is missing the ${MARKER} marker`);
  }
  return raw.slice(idx + MARKER.length).trim();
}
