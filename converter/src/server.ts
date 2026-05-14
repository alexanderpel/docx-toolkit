import express from "express";

import { convertDocxBase64 } from "./convert.js";

const PORT = Number(process.env.PORT ?? 5175);
const SHARED_SECRET = process.env.CONVERTER_SHARED_SECRET ?? "";
const ALLOWED_ORIGIN = process.env.CONVERTER_ALLOWED_ORIGIN ?? "*";
const BODY_LIMIT_MB = Number(process.env.CONVERTER_BODY_LIMIT_MB ?? 50);
// Base64 inflates payloads by ~33%, so a 50MB docx is ~67MB encoded. Pad the
// JSON body limit to keep comfortable headroom.
const BODY_LIMIT = `${Math.ceil(BODY_LIMIT_MB * 1.4)}mb`;

const app = express();
app.use(express.json({ limit: BODY_LIMIT }));

// CORS — same-origin assumed for production deployment; permissive default
// only because this service is meant to be called server-to-server, not
// from a browser, and a misconfigured origin should fail loudly during
// integration, not silently.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Converter-Secret");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const requireSecret: express.RequestHandler = (req, res, next) => {
  if (!SHARED_SECRET) {
    next();
    return;
  }
  const presented = req.header("x-converter-secret");
  if (presented !== SHARED_SECRET) {
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
    res.status(500).json({ error: "conversion failed", detail: message });
  }
});

app.listen(PORT, () => {
  console.log(`[converter] listening on http://localhost:${PORT}`);
  if (!SHARED_SECRET) {
    console.log("[converter] WARNING: CONVERTER_SHARED_SECRET not set — unauthenticated");
  }
});
