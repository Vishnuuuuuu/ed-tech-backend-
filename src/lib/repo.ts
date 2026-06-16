import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url)); // src/lib

/** Absolute path to the repo root (slp-backend/). */
export const repoRoot = resolve(here, "../../");

/** Versioned extraction/simulation prompts (read at runtime by the services). */
export const promptsDir = resolve(repoRoot, "prompts");

/** Optional test PDFs for the CLI verify/pipeline tools (not required in prod). */
export const docsDir = resolve(repoRoot, "docs");
