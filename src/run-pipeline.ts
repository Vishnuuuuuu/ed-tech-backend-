import "dotenv/config";
import { resolve } from "node:path";
import { UsageTracker } from "./lib/anthropic.js";
import { extractPdfTextFromPath } from "./services/extraction/pdf.js";
import { extractConceptMap } from "./services/extraction/extract.js";
import { simulateRelationships } from "./services/simulation/simulate.js";

/**
 * CLI: run extraction + simulation on a single PDF path.
 *   pnpm --filter @slp/backend pipeline <path-to-pdf>
 */
async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: tsx src/run-pipeline.ts <path-to-pdf>");
    process.exit(1);
  }
  const path = resolve(process.cwd(), arg);
  const tracker = new UsageTracker();

  console.error(`Reading ${path} …`);
  const text = await extractPdfTextFromPath(path);
  console.error(`Extracted ${text.length} chars of text. Running extraction …`);

  const extraction = await extractConceptMap(text, { tracker });
  console.error(`Got ${extraction.nodes.length} nodes. Running simulation …`);

  const { result, dropped, ungrounded } = await simulateRelationships(
    extraction.nodes,
    text,
    { tracker },
  );
  if (dropped.length) {
    console.error(`Dropped ${dropped.length} invalid edge(s) (bad node refs).`);
  }
  if (ungrounded.length) {
    console.error(`Dropped ${ungrounded.length} ungrounded edge(s):`);
    for (const e of ungrounded) console.error(`  - ${e.kind}: "${e.evidence}"`);
  }

  console.log(
    JSON.stringify({ extraction, edges: result.edges }, null, 2),
  );

  const { totalCost, totalCalls } = tracker.summary();
  console.error(
    `\n${totalCalls} model call(s), estimated cost $${totalCost.toFixed(4)}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
