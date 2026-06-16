import "dotenv/config";
import express from "express";
import cors from "cors";
import { initStore } from "./store/index.js";
import { apiRouter, uploadErrorHandler } from "./routes/api.js";

async function main() {
  await initStore();

  const app = express();

  // Allow the frontend origin; permit common dev ports (3000/3001 fallback).
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  app.use(
    cors({
      origin: [corsOrigin, "http://localhost:3000", "http://localhost:3001"],
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
