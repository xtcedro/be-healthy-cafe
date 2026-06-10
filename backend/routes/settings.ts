import { Hono } from "hono";
import type { Database } from "../db.ts";

export function settingsRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json(db.getSettings()));

  app.put("/", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body !== "object" || body === null) {
      return c.json({ error: "Expected an object of settings." }, 400);
    }
    // Only allow known keys; coerce everything to string.
    const allowed = ["tax_rate", "shop_name", "shop_address", "shop_phone"];
    const updates: Record<string, string> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = String((body as Record<string, unknown>)[key]);
    }
    if ("tax_rate" in updates) {
      const rate = Number(updates.tax_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        return c.json({ error: "tax_rate must be a fraction between 0 and 1." }, 400);
      }
    }
    return c.json(db.updateSettings(updates));
  });

  return app;
}
