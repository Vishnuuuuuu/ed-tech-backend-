import type { Store } from "./types.js";
import { createMemoryStore } from "./memoryStore.js";

export * from "./types.js";

let store: Store | null = null;

/**
 * Initialize the persistence layer once at startup. Uses Mongo when
 * MONGODB_URI is set; otherwise falls back to an in-memory store so the app
 * still runs end-to-end (data won't survive a restart — set MONGODB_URI for
 * real persistence).
 */
export async function initStore(): Promise<Store> {
  if (store) return store;
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      const { createMongoStore } = await import("./mongoStore.js");
      store = await createMongoStore(uri);
      console.log("[store] connected to MongoDB");
      return store;
    } catch (err) {
      console.error(
        `[store] MongoDB connection failed (${err instanceof Error ? err.message : err}); falling back to in-memory store.`,
      );
    }
  } else {
    console.warn("[store] MONGODB_URI not set — using in-memory store (data will not survive a restart).");
  }
  store = createMemoryStore();
  return store;
}

export function getStore(): Store {
  if (!store) throw new Error("store not initialized — call initStore() first");
  return store;
}
