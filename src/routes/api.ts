import { Router, type ErrorRequestHandler } from "express";
import multer from "multer";
import {
  UpdateMapRequestSchema,
  type GetMapResponseT,
  type JobStatusResponseT,
  type ListMapsResponseT,
} from "#shared";
import { getStore, PLACEHOLDER_USER_ID } from "../store/index.js";
import { processDocument } from "../services/jobs/worker.js";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

export const apiRouter = Router();

// POST /documents — validate, queue a job, kick the worker, return jobId fast.
apiRouter.post("/documents", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }
  const isPdf = file.mimetype === "application/pdf" && /\.pdf$/i.test(file.originalname);
  if (!isPdf) {
    res.status(400).json({ error: "Only PDF files are supported." });
    return;
  }

  const store = getStore();
  const doc = await store.createDocument({
    userId: PLACEHOLDER_USER_ID,
    filename: file.originalname,
    status: "stored",
  });
  const job = await store.createJob({
    documentId: doc.id,
    userId: PLACEHOLDER_USER_ID,
    status: "queued",
    stage: "uploading",
    startedAt: Date.now(),
  });

  // Kick the worker WITHOUT awaiting — return immediately.
  void processDocument(job.id, doc.id, new Uint8Array(file.buffer));

  res.json({ jobId: job.id });
});

// GET /jobs/:id
apiRouter.get("/jobs/:id", async (req, res) => {
  const job = await getStore().getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  const body: JobStatusResponseT = {
    status: job.status,
    stage: job.stage,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    mapId: job.mapId,
  };
  res.json(body);
});

// GET /maps — recent maps for the placeholder user (newest first).
apiRouter.get("/maps", async (_req, res) => {
  const maps = await getStore().listMaps(PLACEHOLDER_USER_ID);
  const body: ListMapsResponseT = {
    maps: maps.map((m) => ({
      id: m.id,
      title: m.title,
      updatedAt: new Date(m.updatedAt).toISOString(),
    })),
  };
  res.json(body);
});

// GET /maps/:id
apiRouter.get("/maps/:id", async (req, res) => {
  const map = await getStore().getMap(req.params.id);
  if (!map) {
    res.status(404).json({ error: "Map not found." });
    return;
  }
  const body: GetMapResponseT = {
    map: {
      id: map.id,
      documentId: map.documentId,
      userId: map.userId,
      title: map.title,
      rootLabel: map.rootLabel,
      positions: map.positions,
      customLabels: map.customLabels,
      updatedAt: new Date(map.updatedAt).toISOString(),
    },
    nodes: map.nodes,
    edges: map.edges,
  };
  res.json(body);
});

// PUT /maps/:id — debounced autosave of title/positions/customLabels.
apiRouter.put("/maps/:id", async (req, res) => {
  const parsed = UpdateMapRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid map update payload." });
    return;
  }
  const updated = await getStore().updateMap(req.params.id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "Map not found." });
    return;
  }
  res.json({ ok: true });
});

/** Convert multer errors (e.g. file too large) into clean 400s. */
export const uploadErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? `File is too large. Maximum is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
        : `Upload error: ${err.message}`;
    res.status(400).json({ error: msg });
    return;
  }
  next(err);
};
