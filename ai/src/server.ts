import express from "express";

const PORT = Number(process.env.PORT ?? 5176);
const AI_SERVICE_SECRET = process.env.AI_SERVICE_SECRET ?? "";
const BODY_LIMIT_MB = Number(process.env.AI_SERVICE_BODY_LIMIT_MB ?? 5);

const app = express();
app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));

const requireSecret: express.RequestHandler = (req, res, next) => {
  if (!AI_SERVICE_SECRET) {
    next();
    return;
  }
  if (req.header("x-ai-secret") !== AI_SERVICE_SECRET) {
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

app.post("/apply-tool", requireSecret, async (_req, res) => {
  // wired in Task 5
  res.status(501).json({ error: "not implemented yet" });
});

app.listen(PORT, () => {
  console.log(`[docx-ai] listening on http://localhost:${PORT}`);
  if (!AI_SERVICE_SECRET) {
    console.log("[docx-ai] WARNING: AI_SERVICE_SECRET not set — unauthenticated");
  }
});
