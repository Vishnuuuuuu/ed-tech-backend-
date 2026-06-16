import "dotenv/config";
import express from "express";
import cors from "cors";
import { initStore } from "./store/index.js";
import { apiRouter, uploadErrorHandler } from "./routes/api.js";

async function main() {
  await initStore();

  const app = express();

  // Allow the configured frontend origin(s) plus local dev ports. CORS_ORIGIN may
  // be a comma-separated list; trailing slashes are tolerated (the browser's
  // Origin header never has one, so we normalize both sides).
  const stripSlash = (s: string) => s.trim().replace(/\/+$/, "");
  const allowedOrigins = Array.from(
    new Set([
      ...(process.env.CORS_ORIGIN ?? "").split(",").map(stripSlash).filter(Boolean),
      "http://localhost:3000",
      "http://localhost:3001",
    ]),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin / non-browser requests (no Origin header) and any
        // explicitly-allowed origin.
        if (!origin || allowedOrigins.includes(stripSlash(origin))) cb(null, true);
        else cb(new Error(`Origin not allowed by CORS: ${origin}`));
      },
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(apiRouter);
  app.use(uploadErrorHandler);

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`backend listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("failed to start backend:", err);
  process.exit(1);
});
