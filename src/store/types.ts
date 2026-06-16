import type { EdgeT, JobStage, JobStatus, NodeT, XYT } from "#shared";

/** Placeholder identity until the auth brief — every record is scoped to this. */
export const PLACEHOLDER_USER_ID = "user_placeholder";

export interface DocumentRec {
  id: string;
  userId: string;
  filename: string;
  status: "stored";
  createdAt: number;
}

export interface JobRec {
  id: string;
  documentId: string;
  userId: string;
  status: JobStatus;
  stage: JobStage;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  mapId?: string;
}

export interface MapRec {
  id: string;
  documentId: string;
  userId: string;
  title: string;
  rootLabel: string;
  nodes: NodeT[];
  edges: EdgeT[];
  positions: Record<string, XYT>;
  customLabels: Record<string, string>;
  updatedAt: number;
}

/** Lightweight map listing for the "Recents" UI. */
export interface MapSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface Store {
  kind: "mongo" | "memory";
  createDocument(rec: Omit<DocumentRec, "id" | "createdAt">): Promise<DocumentRec>;
  createJob(rec: Omit<JobRec, "id" | "createdAt">): Promise<JobRec>;
  getJob(id: string): Promise<JobRec | null>;
  updateJob(id: string, patch: Partial<JobRec>): Promise<void>;
  saveMap(rec: Omit<MapRec, "id" | "updatedAt">): Promise<MapRec>;
  getMap(id: string): Promise<MapRec | null>;
  listMaps(userId: string): Promise<MapSummary[]>;
  updateMap(
    id: string,
    patch: Pick<MapRec, "title" | "positions" | "customLabels">,
  ): Promise<MapRec | null>;
}
