import express from "express";
import { acquireRoom, drainPool } from "./superdocClientPool.js";
import { dispatch } from "./dispatch.js";

const BODY_LIMIT_MB = Number(process.env.AI_SERVICE_BODY_LIMIT_MB ?? 5);

// Reads env at handler-call time so per-test overrides apply.
export const createServer = (): express.Express => {
  const app = express();
  app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));

  const requireSecret: express.RequestHandler = (req, res, next) => {
    const expected = process.env.AI_SERVICE_SECRET ?? "";
    if (!expected) {
      next();
      return;
    }
    if (req.header("x-ai-secret") !== expected) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "docx-ai",
      license: "AGPL-3.0-or-later",
      source: "https://github.com/alexanderpel/docx-toolkit",
      description: "POST /apply-tool with { documentId, tool, args } to run a SuperDoc intent tool against a live Hocuspocus room.",
    });
  });

  type ApplyToolBody = {
    documentId?: string;
    tool?: string;
    args?: Record<string, unknown>;
  };

  app.post("/apply-tool", requireSecret, async (req, res) => {
    const { documentId, tool, args } = (req.body ?? {}) as ApplyToolBody;
    if (!documentId || !tool) {
      res.status(400).json({ error: "missing documentId or tool" });
      return;
    }

    let release: (() => void) | null = null;
    try {
      const { handle, release: rel } = await acquireRoom(documentId);
      release = rel;
      const { result, inverseOp } = await dispatch(handle, tool, args ?? {});
      res.json({ result, inverseOp });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[docx-ai] apply-tool failed:", message);
      res.status(500).json({ error: "dispatch failed", detail: message.slice(0, 200) });
    } finally {
      if (release) release();
    }
  });

  return app;
};

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const PORT = Number(process.env.PORT ?? 5176);
  const app = createServer();
  app.listen(PORT, () => {
    console.log(`[docx-ai] listening on http://localhost:${PORT}`);
    if (!process.env.AI_SERVICE_SECRET) {
      console.log("[docx-ai] WARNING: AI_SERVICE_SECRET not set — unauthenticated");
    }
  });

  process.on("SIGTERM", () => { drainPool(); process.exit(0); });
  process.on("SIGINT", () => { drainPool(); process.exit(0); });
}
