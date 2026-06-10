import { Hono } from "hono";
import type { Database } from "../db.ts";

export function catalogRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const includeInactive = c.req.query("all") === "1";
    return c.json(db.listCatalog(includeInactive));
  });

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null) as
      | { name?: string; category?: string; price_cents?: number; color?: string; description?: string }
      | null;
    if (!body || !body.name || typeof body.price_cents !== "number") {
      return c.json({ error: "name and price_cents are required." }, 400);
    }
    const item = db.createCatalogItem({
      name: String(body.name),
      category: String(body.category ?? "General"),
      price_cents: Math.round(body.price_cents),
      color: body.color != null ? String(body.color) : null,
      description: body.description != null ? String(body.description) : null,
    });
    return c.json(item, 201);
  });

  app.put("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const item = db.updateCatalogItem(id, body);
    if (!item) return c.json({ error: "Not found." }, 404);
    return c.json(item);
  });

  app.delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    // ?permanent=1 removes the row entirely; otherwise soft-hide (active = 0).
    const permanent = c.req.query("permanent") === "1";
    const ok = permanent ? db.purgeCatalogItem(id) : db.deleteCatalogItem(id);
    if (!ok) return c.json({ error: "Not found." }, 404);
    return c.json({ ok: true, permanent });
  });

  return app;
}
