import express from "express";

import { convertDocxBase64 } from "./convert.js";

const BODY_LIMIT_MB = Number(process.env.CONVERTER_BODY_LIMIT_MB ?? 50);
// Base64 inflates payloads by ~33%, so a 50MB docx is ~67MB encoded. Pad the
// JSON body limit to keep comfortable headroom.
const BODY_LIMIT = `${Math.ceil(BODY_LIMIT_MB * 1.4)}mb`;

// Reads env at handler-call time so per-test overrides apply.
export const createServer = (): express.Express => {
  const app = express();
  app.use(express.json({ limit: BODY_LIMIT }));

  // Permissive default; service is server-to-server, tighten via env if exposed.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.CONVERTER_ALLOWED_ORIGIN ?? "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-Converter-Secret");
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const requireSecret: express.RequestHandler = (req, res, next) => {
    const expected = process.env.CONVERTER_SHARED_SECRET ?? "";
    if (!expected) {
      next();
      return;
    }
    if (req.header("x-converter-secret") !== expected) {
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
      name: "docx-converter",
      license: "AGPL-3.0-or-later",
      source: "https://github.com/alexanderpel/docx-toolkit",
      description: "POST /convert with { base64Raw: string } to receive ProseMirror JSON.",
    });
  });

  app.post("/convert", requireSecret, async (req, res) => {
    const base64Raw = typeof req.body?.base64Raw === "string" ? req.body.base64Raw : null;
    if (!base64Raw) {
      res.status(400).json({ error: "missing base64Raw in body" });
      return;
    }

    try {
      const result = await convertDocxBase64(base64Raw);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[converter] convert failed:", message);
      res.status(500).json({ error: "conversion failed", detail: message.slice(0, 200) });
    }
  });

  return app;
};
