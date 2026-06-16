import { z } from "zod";

/**
 * Single source of truth for the concept-map contracts.
 *
 * The backend validates LLM output and inbound API payloads against these
 * schemas; the frontend infers its types from them. Keep the shapes free of
 * JSON-Schema-unsupported constraints (no min/max length, no recursion) so the
 * same schemas can be reused to constrain structured model output.
 */

// ---------------------------------------------------------------------------
// Core graph primitives
// ---------------------------------------------------------------------------

export const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  /** Parent in the concept hierarchy; null for top-level / flat nodes. */
  parentId: z.string().nullable(),
});
export type NodeT = z.infer<typeof NodeSchema>;

/**
 * Relationship kinds. Expanded from the initial influences/conflicts/relates
 * sketch so the test set can be represented honestly:
 *  - depends_on    : a concept requires/uses another (e.g. OSI layer stack)
 *  - produces_for  : a producer hands output to a consumer (organelles)
 *  - influences    : one concept causally affects another
 *  - conflicts     : an opposing / inverse relationship (price vs demand)
 *  - precedes      : pure temporal sequence — NOT causation (timelines)
 *  - relates       : generic association when nothing stronger applies
 */
export const EdgeKindSchema = z.enum([
  "depends_on",
  "produces_for",
  "influences",
  "conflicts",
  "precedes",
  "relates",
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const EdgeSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  kind: EdgeKindSchema,
  rationale: z.string(),
  /**
   * A short verbatim span (≤ ~20 words) from the source text that explicitly
   * states the relationship. Used to ground edges against fabrication: the
   * backend drops any edge whose evidence does not appear in the source.
   */
  evidence: z.string(),
});
export type EdgeT = z.infer<typeof EdgeSchema>;

// ---------------------------------------------------------------------------
// LLM pipeline results
// ---------------------------------------------------------------------------

/** Output of the extraction pass: a root label + the node set (hierarchy via parentId). */
export const ExtractionResultSchema = z.object({
  rootLabel: z.string(),
  nodes: z.array(NodeSchema),
});
export type ExtractionResultT = z.infer<typeof ExtractionResultSchema>;

/** Output of the simulation/relationship pass. */
export const SimulationResultSchema = z.object({
  edges: z.array(EdgeSchema),
});
export type SimulationResultT = z.infer<typeof SimulationResultSchema>;

// ---------------------------------------------------------------------------
// Job + map model
// ---------------------------------------------------------------------------

export const JobStatusSchema = z.enum([
  "queued",
  "processing",
  "done",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * Sub-state shown while `status === "processing"`, so the loading UI can show
 * which stage of the pipeline is running (and a real elapsed timer rather than
 * a fake progress bar).
 */
export const JobStageSchema = z.enum([
  "uploading",
  "parsing",
  "extracting",
  "relating",
  "done",
  "failed",
]);
export type JobStage = z.infer<typeof JobStageSchema>;

/** Runtime job state (in-memory in the UI; a Job doc on the backend later). */
export const JobSchema = z.object({
  status: JobStatusSchema,
  stage: JobStageSchema,
  /** Wall-clock epoch ms — used to compute live elapsed time. */
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  error: z.string().optional(),
});
export type JobT = z.infer<typeof JobSchema>;

// ---------------------------------------------------------------------------
// API request / response contracts (PROJECT_OVERVIEW §6)
// ---------------------------------------------------------------------------

/** POST /documents -> { jobId } */
export const CreateDocumentResponseSchema = z.object({
  jobId: z.string(),
});
export type CreateDocumentResponseT = z.infer<
  typeof CreateDocumentResponseSchema
>;

/** GET /jobs/:id -> { status, stage, startedAt?, finishedAt?, error?, mapId? } */
export const JobStatusResponseSchema = z.object({
  status: JobStatusSchema,
  stage: JobStageSchema,
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  mapId: z.string().optional(),
  error: z.string().optional(),
});
export type JobStatusResponseT = z.infer<typeof JobStatusResponseSchema>;

/** Per-node canvas position. */
export const XYSchema = z.object({ x: z.number(), y: z.number() });
export type XYT = z.infer<typeof XYSchema>;

/**
 * GET /maps/:id -> { map, nodes[], edges[] }.
 *
 * Relationships (`edges`) are computed inside the job (extraction → relation)
 * and stored with the map — there is no standalone simulate step. User
 * customizations (`positions`, `customLabels`) persist via PUT /maps/:id.
 */
export const MapSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  userId: z.string(),
  title: z.string(),
  rootLabel: z.string(),
  positions: z.record(z.string(), XYSchema),
  customLabels: z.record(z.string(), z.string()),
  updatedAt: z.string(),
});
export type MapT = z.infer<typeof MapSchema>;

export const GetMapResponseSchema = z.object({
  map: MapSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});
export type GetMapResponseT = z.infer<typeof GetMapResponseSchema>;

/** PUT /maps/:id { title, positions, customLabels } -> { ok } (debounced autosave) */
export const UpdateMapRequestSchema = z.object({
  title: z.string(),
  positions: z.record(z.string(), XYSchema),
  customLabels: z.record(z.string(), z.string()),
});
export type UpdateMapRequestT = z.infer<typeof UpdateMapRequestSchema>;

export const UpdateMapResponseSchema = z.object({
  ok: z.boolean(),
});
export type UpdateMapResponseT = z.infer<typeof UpdateMapResponseSchema>;
