import { JSDOM } from "jsdom";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

const HOCUSPOCUS_URL = process.env.HOCUSPOCUS_URL ?? "ws://localhost:2000";
const AI_SERVICE_TOKEN = process.env.HOCUSPOCUS_AI_SERVICE_SECRET ?? "";
const POOL_MAX = Number(process.env.AI_HOCUSPOCUS_POOL_MAX ?? 16);
const POOL_IDLE_MS = Number(process.env.AI_HOCUSPOCUS_POOL_IDLE_MS ?? 300_000);

const DOCX_ROOM_PREFIX = "docx:";

type Entry = {
  documentId: string;
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  lastUsedAt: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  refCount: number;
};

const pool = new Map<string, Entry>();

const setupJSDOM = () => {
  if ((globalThis as any).window) return;
  const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  (globalThis as any).navigator = window.navigator;
};

const destroy = (documentId: string) => {
  const e = pool.get(documentId);
  if (!e) return;
  if (e.idleTimer) clearTimeout(e.idleTimer);
  e.provider.destroy();
  e.ydoc.destroy();
  pool.delete(documentId);
};

const evictLRU = () => {
  let oldest: Entry | null = null;
  for (const e of pool.values()) {
    if (e.refCount > 0) continue;
    if (!oldest || e.lastUsedAt < oldest.lastUsedAt) oldest = e;
  }
  if (oldest) destroy(oldest.documentId);
};

const scheduleIdleClose = (e: Entry) => {
  if (e.idleTimer) clearTimeout(e.idleTimer);
  e.idleTimer = setTimeout(() => {
    if (e.refCount === 0) destroy(e.documentId);
  }, POOL_IDLE_MS);
};

export const acquireRoom = async (
  documentId: string,
): Promise<{ ydoc: Y.Doc; release: () => void }> => {
  setupJSDOM();

  let entry = pool.get(documentId);
  if (!entry) {
    if (pool.size >= POOL_MAX) evictLRU();

    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: `${DOCX_ROOM_PREFIX}${documentId}`,
      token: AI_SERVICE_TOKEN,
      document: ydoc,
      forceSyncInterval: 0,
    });

    await new Promise<void>((resolve, reject) => {
      const onSynced = () => {
        provider.off("synced", onSynced);
        provider.off("authenticationFailed", onFail);
        resolve();
      };
      const onFail = (data: { reason?: string }) => {
        provider.off("synced", onSynced);
        provider.off("authenticationFailed", onFail);
        reject(new Error(`hocuspocus auth failed: ${data?.reason ?? "unknown"}`));
      };
      provider.on("synced", onSynced);
      provider.on("authenticationFailed", onFail);
    });

    entry = {
      documentId,
      ydoc,
      provider,
      lastUsedAt: Date.now(),
      idleTimer: null,
      refCount: 0,
    };
    pool.set(documentId, entry);
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

  return { ydoc: entry.ydoc, release };
};

export const drainPool = () => {
  for (const id of Array.from(pool.keys())) destroy(id);
};
