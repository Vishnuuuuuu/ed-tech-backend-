import { MODELS } from "../../lib/anthropic.js";
import { extractPdfText } from "../extraction/pdf.js";
import { extractConceptMap } from "../extraction/extract.js";
import { simulateRelationships } from "../simulation/simulate.js";
import { getStore, PLACEHOLDER_USER_ID } from "../../store/index.js";

/**
 * In-process async worker: parsing → extracting (Haiku) → relating (Sonnet) →
 * save Map. Advances job.stage at each step; on any failure records the error.
 * Relationships are computed here and stored with the map (no user simulate step).
 */
export async function processDocument(jobId: string, documentId: string, pdf: Uint8Array): Promise<void> {
  const store = getStore();
  try {
    await store.updateJob(jobId, { status: "processing", stage: "parsing", startedAt: Date.now() });
    const text = await extractPdfText(pdf); // throws ImageOnlyPdfError on scanned PDFs

    await store.updateJob(jobId, { stage: "extracting" });
    const extraction = await extractConceptMap(text, { model: MODELS.haiku });

    await store.updateJob(jobId, { stage: "relating" });
    const { result } = await simulateRelationships(extraction.nodes, text, { model: MODELS.sonnet });

    const map = await store.saveMap({
      documentId,
      userId: PLACEHOLDER_USER_ID,
      title: extraction.rootLabel,
      rootLabel: extraction.rootLabel,
      nodes: extraction.nodes,
      edges: result.edges,
      positions: {},
      customLabels: {},
    });

    await store.updateJob(jobId, {
      status: "done",
      stage: "done",
      finishedAt: Date.now(),
      mapId: map.id,
    });
  } catch (err) {
    await store.updateJob(jobId, {
      status: "failed",
      stage: "failed",
      error: err instanceof Error ? err.message : String(err),
      finishedAt: Date.now(),
    });
  }
}
