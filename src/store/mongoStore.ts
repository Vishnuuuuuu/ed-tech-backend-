import mongoose, { Schema } from "mongoose";
import { nanoid } from "nanoid";
import type { DocumentRec, JobRec, MapRec, Store } from "./types.js";

const NodeSub = new Schema(
  { id: String, label: String, description: String, parentId: { type: String, default: null } },
  { _id: false },
);
const EdgeSub = new Schema(
  { id: String, fromNodeId: String, toNodeId: String, kind: String, rationale: String, evidence: String },
  { _id: false },
);

const DocumentSchema = new Schema({
  _id: String,
  userId: String,
  filename: String,
  status: String,
  createdAt: Number,
});

const JobSchema = new Schema({
  _id: String,
  documentId: String,
  userId: String,
  status: String,
  stage: String,
  error: String,
  createdAt: Number,
  startedAt: Number,
  finishedAt: Number,
  mapId: String,
});

const MapSchema = new Schema({
  _id: String,
  documentId: String,
  userId: String,
  title: String,
  rootLabel: String,
  nodes: [NodeSub],
  edges: [EdgeSub],
  positions: Schema.Types.Mixed,
  customLabels: Schema.Types.Mixed,
  updatedAt: Number,
});

// Guard against model recompile on hot reload.
const DocumentModel = mongoose.models.Document ?? mongoose.model("Document", DocumentSchema);
const JobModel = mongoose.models.Job ?? mongoose.model("Job", JobSchema);
const MapModel = mongoose.models.Map ?? mongoose.model("Map", MapSchema);

function rename<T>(obj: unknown): T {
  const { _id, __v, ...rest } = obj as Record<string, unknown> & { _id: unknown };
  void __v;
  return { id: _id, ...rest } as T;
}

/** Connect to Mongo and return a Store backed by Mongoose. Throws if connect fails. */
export async function createMongoStore(uri: string): Promise<Store> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  return {
    kind: "mongo",

    async createDocument(rec: Omit<DocumentRec, "id" | "createdAt">) {
      const doc = await DocumentModel.create({ _id: nanoid(), createdAt: Date.now(), ...rec });
      return rename<DocumentRec>(doc.toObject());
    },

    async createJob(rec: Omit<JobRec, "id" | "createdAt">) {
      const job = await JobModel.create({ _id: nanoid(), createdAt: Date.now(), ...rec });
      return rename<JobRec>(job.toObject());
    },

    async getJob(id) {
      const job = await JobModel.findById(id).lean();
      return job ? rename<JobRec>(job) : null;
    },

    async updateJob(id, patch) {
      await JobModel.findByIdAndUpdate(id, patch);
    },

    async saveMap(rec: Omit<MapRec, "id" | "updatedAt">) {
      const map = await MapModel.create({ _id: nanoid(), updatedAt: Date.now(), ...rec });
      return rename<MapRec>(map.toObject());
    },

    async getMap(id) {
      const map = await MapModel.findById(id).lean();
      return map ? rename<MapRec>(map) : null;
    },

    async updateMap(id, patch) {
      const map = await MapModel.findByIdAndUpdate(
        id,
        { ...patch, updatedAt: Date.now() },
        { new: true },
      ).lean();
      return map ? rename<MapRec>(map) : null;
    },
  };
}
