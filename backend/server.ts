// Bee Healthy Cafe POS backend.
//
// A Hono HTTP server bound strictly to 127.0.0.1, started as a sidecar by the
// Electron main process. It never listens on a public interface. Electron passes
// the port and DB path via env vars (POS_PORT, POS_DB_PATH) and waits for /health
// before loading the UI.

import { Hono } from "hono";
import { Database } from "./db.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { salesRoutes } from "./routes/sales.ts";
import { settingsRoutes } from "./routes/settings.ts";

export function createApp(db: Database): Hono {
  const app = new Hono();

  // Readiness probe used by the Electron launcher.
  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/catalog", catalogRoutes(db));
  app.route("/sales", salesRoutes(db));
  app.route("/settings", settingsRoutes(db));

  app.onError((err, c) => {
    console.error("[backend] unhandled error:", err);
    return c.json({ error: "Internal error." }, 500);
  });

  return app;
}

// Only start a listener when run directly, so tests can import createApp cleanly.
if (import.meta.main) {
  const port = Number(Deno.env.get("POS_PORT") ?? "0") || 0;
  const dbPath = Deno.env.get("POS_DB_PATH") ?? "./bee-pos.db";

  const db = new Database(dbPath);
  const app = createApp(db);

  const server = Deno.serve({
    port,
    hostname: "127.0.0.1",
    onListen: ({ hostname, port }) => {
      // Printed so the Electron launcher can confirm the bound port from stdout.
      console.log(`[backend] listening on http://${hostname}:${port}`);
    },
  }, app.fetch);

  const shutdown = () => {
    db.close();
    server.shutdown().finally(() => Deno.exit(0));
  };
  Deno.addSignalListener("SIGINT", shutdown);
  // SIGTERM is not supported on Windows; only register it where available.
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", shutdown);
  }
}
