import { createSuperDocClient, type SuperDocClient, type SuperDocDocument } from "@superdoc-dev/sdk";

const HOCUSPOCUS_URL = process.env.HOCUSPOCUS_URL ?? "ws://localhost:2000";
const AI_SERVICE_TOKEN_ENV = "HOCUSPOCUS_AI_SERVICE_SECRET";
const POOL_MAX = Number(process.env.AI_HOCUSPOCUS_POOL_MAX ?? 16);
const POOL_IDLE_MS = Number(process.env.AI_HOCUSPOCUS_POOL_IDLE_MS ?? 300_000);
const CONNECT_MS = Number(process.env.AI_HOCUSPOCUS_CONNECT_MS ?? 10_000);

const DOCX_ROOM_PREFIX = "docx:";

type Entry = {
  documentId: string;
  handle: SuperDocDocument;
  client: SuperDocClient;
  lastUsedAt: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  refCount: number;
};

const pool = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();

const destroy = async (documentId: string) => {
  const e = pool.get(documentId);
  if (!e) return;
  if (e.idleTimer) clearTimeout(e.idleTimer);
  pool.delete(documentId);
  try {
    await e.handle.close();
  } catch {
    // best-effort
  }
  try {
    await e.client.dispose();
  } catch {
    // best-effort
  }
};

const evictLRU = async () => {
  let oldest: Entry | null = null;
  for (const e of pool.values()) {
    if (e.refCount > 0) continue;
    if (!oldest || e.lastUsedAt < oldest.lastUsedAt) oldest = e;
  }
  if (oldest) await destroy(oldest.documentId);
};

const scheduleIdleClose = (e: Entry) => {
  if (e.idleTimer) clearTimeout(e.idleTimer);
  e.idleTimer = setTimeout(() => {
    if (e.refCount === 0) void destroy(e.documentId);
  }, POOL_IDLE_MS);
};

const connectEntry = async (documentId: string): Promise<Entry> => {
  if (pool.size >= POOL_MAX) await evictLRU();

  // One SuperDocClient per room: keeps lifecycle/dispose semantics simple and
  // isolates child-process failures to a single document.
  const client = createSuperDocClient({
    env: { [AI_SERVICE_TOKEN_ENV]: process.env[AI_SERVICE_TOKEN_ENV] ?? "" },
  });

  let handle: SuperDocDocument | null = null;
  try {
    await client.connect();

    handle = await new Promise<SuperDocDocument>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`superdoc open timeout after ${CONNECT_MS}ms`));
      }, CONNECT_MS);

      client
        .open({
          collaboration: {
            providerType: "hocuspocus",
            url: HOCUSPOCUS_URL,
            documentId: `${DOCX_ROOM_PREFIX}${documentId}`,
            tokenEnv: AI_SERVICE_TOKEN_ENV,
          },
        })
        .then((h) => {
          if (settled) {
            // We timed out before open resolved; close the late handle.
            void h.close().catch(() => {});
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(h);
        })
        .catch((err: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const msg = err instanceof Error ? err.message : String(err);
          reject(new Error(`superdoc open failed: ${msg}`));
        });
    });
  } catch (err) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // best-effort
      }
    }
    try {
      await client.dispose();
    } catch {
      // best-effort
    }
    throw err;
  }

  return {
    documentId,
    handle,
    client,
    lastUsedAt: Date.now(),
    idleTimer: null,
    refCount: 0,
  };
};

export const acquireRoom = async (
  documentId: string,
): Promise<{ handle: SuperDocDocument; release: () => void }> => {
  let entry = pool.get(documentId);
  if (!entry) {
    let inflight = pending.get(documentId);
    if (!inflight) {
      inflight = (async () => {
        try {
          const built = await connectEntry(documentId);
          pool.set(documentId, built);
          return built;
        } finally {
          pending.delete(documentId);
        }
      })();
      pending.set(documentId, inflight);
    }
    entry = await inflight;
  }

  entry.refCount++;
  entry.lastUsedAt = Date.now();
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }

  const localEntry = entry;
  const release = () => {
    localEntry.refCount = Math.max(0, localEntry.refCount - 1);
    localEntry.lastUsedAt = Date.now();
    if (localEntry.refCount === 0) scheduleIdleClose(localEntry);
  };

  return { handle: entry.handle, release };
};

export const drainPool = () => {
  for (const id of Array.from(pool.keys())) {
    void destroy(id);
  }
};
