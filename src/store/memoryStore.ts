import { nanoid } from "nanoid";
import type { DocumentRec, JobRec, MapRec, Store } from "./types.js";

/**
 * In-memory store — the fallback when MONGODB_URI is not set. Lets the full
 * pipeline run for local testing. Data does NOT survive a restart; set
 * MONGODB_URI to use the Mongo store for persistence.
 */
export function createMemoryStore(): Store {
  const documents = new Map<string, DocumentRec>();
  const jobs = new Map<string, JobRec>();
  const maps = new Map<string, MapRec>();

  return {
    kind: "memory",

    async createDocument(rec) {
      const doc: DocumentRec = { ...rec, id: nanoid(), createdAt: Date.now() };
      documents.set(doc.id, doc);
      return doc;
    },

    async createJob(rec) {
      const job: JobRec = { ...rec, id: nanoid(), createdAt: Date.now() };
      jobs.set(job.id, job);
      return job;
    },

    async getJob(id) {
      return jobs.get(id) ?? null;
    },

    async updateJob(id, patch) {
      const job = jobs.get(id);
      if (job) jobs.set(id, { ...job, ...patch });
    },

    async saveMap(rec) {
      const map: MapRec = { ...rec, id: nanoid(), updatedAt: Date.now() };
      maps.set(map.id, map);
      return map;
    },

    async getMap(id) {
      return maps.get(id) ?? null;
    },

    async updateMap(id, patch) {
      const map = maps.get(id);
      if (!map) return null;
      const next: MapRec = { ...map, ...patch, updatedAt: Date.now() };
      maps.set(id, next);
      return next;
    },
  };
}
