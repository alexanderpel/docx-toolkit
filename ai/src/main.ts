import { createServer } from "./server.js";
import { drainPool } from "./superdocClientPool.js";

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
