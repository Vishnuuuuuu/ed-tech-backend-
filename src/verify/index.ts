import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtractionResultT } from "#shared";
import { repoRoot, docsDir } from "../lib/repo.js";
import { MODELS, UsageTracker } from "../lib/anthropic.js";
import { extractPdfTextFromPath } from "../services/extraction/pdf.js";
import { extractConceptMap } from "../services/extraction/extract.js";
import { simulateRelationships } from "../services/simulation/simulate.js";
import { FIXTURES } from "./fixtures.js";
import { scoreRun, determinism, edgeDeterminism } from "./metrics.js";
import {
  generateReport,
  type ExtractionEval,
  type RelationEval,
} from "./report.js";

/**
 * Answer-key corrections made during error analysis (§4). Each entry is logged
 * in the report. Only genuinely-omitted VALID relationships may be added here —
 * never edits that mask a real model error.
 */
const KEY_CORRECTIONS: string[] = [
  "train_2_cell_organelles: added **ATP** as an accepted edge concept. Justification: the answer key (TEST_SET_GUIDE) explicitly lists the relationship \"Mitochondria provide ATP that powers the other organelles\", so `Mitochondria→ATP` (produces_for) is a genuinely-valid relationship the canonical node list omitted. ATP is NOT counted toward recall or hallucination.",
  "train_2_cell_organelles: accept organelle→whole-cell functional edges as valid (rootIsValidTarget). Justification: the document describes the nucleus/lysosome/membrane roles relative to the whole cell (e.g. \"the membrane regulates which substances enter and leave the cell\"); these are real, grounded dynamics, just directed at the cell rather than a peer organelle.",
  "train_1_osi_model: accept `produces_for` as a valid kind for Encapsulation↔layer edges. Justification: the guide describes encapsulation as \"header added going down, stripped going up\" — a transform/produce relationship — so an Encapsulation→layer `produces_for` edge is a genuinely-valid relationship the validator's kind list omitted.",
];

const RUNS = 3;

async function main() {
  const args = process.argv.slice(2);
  const runs = Number(args.find((a) => a.startsWith("--runs="))?.split("=")[1]) || RUNS;
  const tracker = new UsageTracker();

  const extractionEvals: ExtractionEval[] = [];
  const haikuRel: RelationEval[] = [];
  const sonnetRel: RelationEval[] = [];

  for (const fixture of FIXTURES) {
    const path = join(docsDir, fixture.file);
    let text: string;
    try {
      text = await extractPdfTextFromPath(path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      extractionEvals.push({ file: fixture.file, type: fixture.type, scores: [], determinism: 0, error: msg });
      continue;
    }

    // --- Extraction re-verification (3 runs on Haiku) ---
    console.error(`\n=== ${fixture.file}: extraction re-verify (Haiku ×${runs}) ===`);
    const extractionRuns: ExtractionResultT[] = [];
    let extractionError: string | undefined;
    try {
      for (let i = 0; i < runs; i++) {
        const ex = await extractConceptMap(text, { model: MODELS.haiku, tracker });
        extractionRuns.push(ex);
        console.error(`  extract run ${i + 1}/${runs}: ${ex.nodes.length} nodes`);
      }
    } catch (err) {
      extractionError = err instanceof Error ? err.message : String(err);
    }

    if (extractionError || !extractionRuns.length) {
      extractionEvals.push({ file: fixture.file, type: fixture.type, scores: [], determinism: 0, error: extractionError ?? "no runs" });
      continue;
    }

    const extractionOutputs = extractionRuns.map((ex) => ({ extraction: ex, edges: [], droppedEdges: 0 }));
    extractionEvals.push({
      file: fixture.file,
      type: fixture.type,
      scores: extractionOutputs.map((o) => scoreRun(fixture, o)),
      determinism: determinism(extractionOutputs),
    });

    // Freeze the run-1 node set for an apples-to-apples relationship comparison.
    const frozen: ExtractionResultT = extractionRuns[0];

    // --- Relationship pass: both models, 3 runs each, on frozen nodes ---
    for (const [label, model, bucket] of [
      ["haiku-4.5", MODELS.haiku, haikuRel] as const,
      ["sonnet-4.6", MODELS.sonnet, sonnetRel] as const,
    ]) {
      console.error(`  --- relationship pass: ${label} ×${runs} ---`);
      const runOutputs: RelationEval["runs"] = [];
      let relError: string | undefined;
      try {
        for (let i = 0; i < runs; i++) {
          const { result, dropped, ungrounded } = await simulateRelationships(frozen.nodes, text, { model, tracker });
          runOutputs.push({ edges: result.edges, dropped: dropped.length, ungrounded: ungrounded.length });
          console.error(`    ${label} run ${i + 1}/${runs}: ${result.edges.length} edges (${ungrounded.length} ungrounded dropped)`);
        }
      } catch (err) {
        relError = err instanceof Error ? err.message : String(err);
        console.error(`    ${label} ERROR: ${relError}`);
      }

      bucket.push({
        file: fixture.file,
        type: fixture.type,
        modelLabel: label,
        fixture,
        frozen,
        runs: runOutputs,
        scores: runOutputs.map((r) =>
          scoreRun(fixture, { extraction: frozen, edges: r.edges, droppedEdges: r.dropped, ungroundedEdges: r.ungrounded }),
        ),
        relDeterminism: edgeDeterminism(runOutputs.map((r) => r.edges)),
        error: relError,
      });
    }
  }

  const report = generateReport(extractionEvals, haikuRel, sonnetRel, tracker, KEY_CORRECTIONS);
  const outPath = join(repoRoot, "backend", "verify-results.md");
  await writeFile(outPath, report, "utf8");

  const { totalCost, totalCalls } = tracker.summary();
  console.error(`\nWrote ${outPath}`);
  console.error(`Total: ${totalCalls} model calls, estimated $${totalCost.toFixed(4)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
