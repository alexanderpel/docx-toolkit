import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 5175);

const app = createServer();
const server = app.listen(PORT, () => {
  console.log(`[converter] listening on http://localhost:${PORT}`);
  if (!process.env.CONVERTER_SHARED_SECRET) {
    console.log("[converter] WARNING: CONVERTER_SHARED_SECRET not set — unauthenticated");
  }
});

// Graceful shutdown; 10s hard cap if connections won't drain.
const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
