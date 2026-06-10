import { Hono } from "hono";
import {
  type Database,
  type DashboardRange,
  localDateString,
  type PaymentType,
  type SaleLineInput,
} from "../db.ts";
import { renderReceiptHtml } from "../receipt.ts";

export function salesRoutes(db: Database): Hono {
  const app = new Hono();

  // List sales for a day (defaults to today) with cash/card reconciliation totals.
  // "today" uses the local calendar day, matching the sale_date stored on each sale.
  app.get("/", (c) => {
    const day = c.req.query("date") === "today" || !c.req.query("date")
      ? localDateString()
      : c.req.query("date")!;
    return c.json(db.listSalesForDay(day));
  });

  // Aggregated owner dashboard for a named range (today | 7d | 30d).
  app.get("/dashboard", (c) => {
    const q = c.req.query("range");
    const range: DashboardRange = q === "7d" || q === "30d" ? q : "today";
    return c.json(db.dashboard(range));
  });

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null) as
      | {
        lines?: SaleLineInput[];
        payment_type?: PaymentType;
        cash_tendered_cents?: number | null;
      }
      | null;

    if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
      return c.json({ error: "A sale needs at least one line item." }, 400);
    }
    if (body.payment_type !== "cash" && body.payment_type !== "card") {
      return c.json({ error: "payment_type must be 'cash' or 'card'." }, 400);
    }
    for (const line of body.lines) {
      if (
        !line.name || typeof line.unit_price_cents !== "number" ||
        typeof line.qty !== "number" || line.qty <= 0
      ) {
        return c.json(
          { error: "Each line needs name, unit_price_cents and a positive qty." },
          400,
        );
      }
    }

    try {
      const sale = db.createSale({
        lines: body.lines,
        payment_type: body.payment_type,
        cash_tendered_cents: body.cash_tendered_cents ?? null,
      });
      return c.json(sale, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/:id", (c) => {
    const sale = db.getSale(Number(c.req.param("id")));
    if (!sale) return c.json({ error: "Not found." }, 404);
    return c.json(sale);
  });

  // Returns printable receipt HTML for a completed sale.
  app.get("/:id/receipt", (c) => {
    const sale = db.getSale(Number(c.req.param("id")));
    if (!sale) return c.json({ error: "Not found." }, 404);
    const html = renderReceiptHtml(sale, db.getSettings());
    return c.html(html);
  });

  return app;
}
