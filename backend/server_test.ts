import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { computeTotals, Database, dateMinusDays, localDateString } from "./db.ts";
import { createApp } from "./server.ts";

// Inserts a sale on a specific local day with a single line item, bypassing the
// "now" timestamp in createSale so tests can populate multiple days.
function insertSaleOn(
  db: Database,
  saleDate: string,
  totalCents: number,
  paymentType: "cash" | "card",
  qty = 1,
): void {
  const createdAt = `${saleDate}T12:00:00.000Z`;
  const res = db.db.prepare(
    "INSERT INTO sales (created_at, sale_date, subtotal_cents, tax_cents, total_cents, payment_type) " +
      "VALUES (?, ?, ?, ?, ?, ?)",
  ).run(createdAt, saleDate, totalCents, 0, totalCents, paymentType);
  db.db.prepare(
    "INSERT INTO sale_line_items (sale_id, name, unit_price_cents, qty, line_total_cents) VALUES (?, ?, ?, ?, ?)",
  ).run(res.lastInsertRowid as number, "Item", totalCents, qty, totalCents * qty);
}

// Each test gets a throwaway in-memory database.
function freshDb(): Database {
  return new Database(":memory:");
}

Deno.test("computeTotals applies OKC 8.625% tax and rounds to the cent", () => {
  // $20.00 @ 8.625% = $1.725 → rounds to $1.73 tax, $21.73 total.
  const t = computeTotals([{ name: "Greek Bowl", unit_price_cents: 2000, qty: 1 }], 0.08625);
  assertEquals(t.subtotal_cents, 2000);
  assertEquals(t.tax_cents, 173);
  assertEquals(t.total_cents, 2173);
});

Deno.test("computeTotals sums quantities and multiple lines", () => {
  const t = computeTotals([
    { name: "Strawberry Banana", unit_price_cents: 749, qty: 2 },
    { name: "Avocado Toast", unit_price_cents: 799, qty: 1 },
  ], 0.08625);
  assertEquals(t.subtotal_cents, 749 * 2 + 799);
  assertEquals(t.tax_cents, Math.round(t.subtotal_cents * 0.08625));
  assertEquals(t.total_cents, t.subtotal_cents + t.tax_cents);
});

Deno.test("createSale recomputes totals server-side and ignores client math", () => {
  const db = freshDb();
  const sale = db.createSale({
    lines: [{ name: "Latte", unit_price_cents: 499, qty: 2 }],
    payment_type: "cash",
    cash_tendered_cents: 2000,
  });
  assertEquals(sale.subtotal_cents, 998);
  assertEquals(sale.tax_cents, Math.round(998 * 0.08625)); // 86
  assertEquals(sale.total_cents, 998 + Math.round(998 * 0.08625));
  assertEquals(sale.change_cents, 2000 - sale.total_cents);
  assertEquals(sale.lines.length, 1);
  assertEquals(sale.lines[0].line_total_cents, 998);
  db.close();
});

Deno.test("card sales record no cash tendered or change", () => {
  const db = freshDb();
  const sale = db.createSale({
    lines: [{ name: "Cold Brew", unit_price_cents: 449, qty: 1 }],
    payment_type: "card",
  });
  assertEquals(sale.payment_type, "card");
  assertEquals(sale.cash_tendered_cents, null);
  assertEquals(sale.change_cents, null);
  db.close();
});

Deno.test("tax rate is configurable via settings and affects new sales", () => {
  const db = freshDb();
  db.updateSettings({ tax_rate: "0" });
  assertEquals(db.getTaxRate(), 0);
  const sale = db.createSale({
    lines: [{ name: "Greek Bowl", unit_price_cents: 1099, qty: 1 }],
    payment_type: "card",
  });
  assertEquals(sale.tax_cents, 0);
  assertEquals(sale.total_cents, 1099);
  db.close();
});

Deno.test("catalog is seeded and soft-delete hides items", () => {
  const db = freshDb();
  const items = db.listCatalog();
  assertEquals(items.length > 0, true);
  const first = items[0];
  db.deleteCatalogItem(first.id);
  const visible = db.listCatalog();
  assertEquals(visible.find((i) => i.id === first.id), undefined);
  // Still present when including inactive.
  const all = db.listCatalog(true);
  assertEquals(all.find((i) => i.id === first.id)?.active, 0);
  db.close();
});

Deno.test("daily totals split cash vs card", () => {
  const db = freshDb();
  db.createSale({
    lines: [{ name: "A", unit_price_cents: 1000, qty: 1 }],
    payment_type: "cash",
    cash_tendered_cents: 1200,
  });
  db.createSale({
    lines: [{ name: "B", unit_price_cents: 500, qty: 1 }],
    payment_type: "card",
  });
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
  const { totals } = db.listSalesForDay(today);
  assertEquals(totals.count, 2);
  // Derive expectations the same way the backend does (tax on subtotal, rounded).
  const cash = computeTotals([{ name: "A", unit_price_cents: 1000, qty: 1 }], 0.08625).total_cents;
  const card = computeTotals([{ name: "B", unit_price_cents: 500, qty: 1 }], 0.08625).total_cents;
  assertEquals(totals.cash_cents, cash);
  assertEquals(totals.card_cents, card);
  assertEquals(totals.total_cents, cash + card);
  db.close();
});

Deno.test("HTTP: /health, POST /sales and receipt endpoint", async () => {
  const db = freshDb();
  const app = createApp(db);

  const health = await app.request("/health");
  assertEquals(health.status, 200);

  const created = await app.request("/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lines: [{ name: "Acai Bowl", unit_price_cents: 999, qty: 1 }],
      payment_type: "cash",
      cash_tendered_cents: 2000,
    }),
  });
  assertEquals(created.status, 201);
  const sale = await created.json();
  assertEquals(sale.total_cents, 999 + Math.round(999 * 0.08625));

  const receipt = await app.request(`/sales/${sale.id}/receipt`);
  assertEquals(receipt.status, 200);
  const html = await receipt.text();
  assertEquals(html.includes("Bee Healthy Cafe"), true);
  assertEquals(html.includes("TOTAL"), true);

  db.close();
});

Deno.test("HTTP: rejects an empty sale", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await app.request("/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: [], payment_type: "cash" }),
  });
  assertEquals(res.status, 400);
  db.close();
});

Deno.test("catalog item persists color and description", () => {
  const db = freshDb();
  const created = db.createCatalogItem({
    name: "Detox Smoothie",
    category: "Smoothies",
    price_cents: 799,
    color: "#16a34a",
    description: "Kale, cucumber, green apple",
  });
  assertEquals(created.color, "#16a34a");
  assertEquals(created.description, "Kale, cucumber, green apple");

  const updated = db.updateCatalogItem(created.id, { color: "#7c3aed" });
  assertEquals(updated?.color, "#7c3aed");
  // Unspecified fields are preserved through the merge.
  assertEquals(updated?.description, "Kale, cucumber, green apple");
  db.close();
});

Deno.test("createCatalogItem defaults color/description to null", () => {
  const db = freshDb();
  const item = db.createCatalogItem({
    name: "Plain",
    category: "Sides",
    price_cents: 100,
  });
  assertEquals(item.color, null);
  assertEquals(item.description, null);
  db.close();
});

Deno.test("permanent delete removes the row; soft delete keeps it", () => {
  const db = freshDb();
  const a = db.createCatalogItem({ name: "A", category: "X", price_cents: 100 });
  const b = db.createCatalogItem({ name: "B", category: "X", price_cents: 200 });

  // Soft delete hides but keeps the row.
  db.deleteCatalogItem(a.id);
  assertEquals(db.listCatalog(true).some((i) => i.id === a.id), true);

  // Permanent delete removes it entirely.
  assertEquals(db.purgeCatalogItem(b.id), true);
  assertEquals(db.listCatalog(true).some((i) => i.id === b.id), false);
  // Purging a missing row returns false.
  assertEquals(db.purgeCatalogItem(99999), false);
  db.close();
});

Deno.test("HTTP DELETE ?permanent=1 purges, default soft-hides", async () => {
  const db = freshDb();
  const app = createApp(db);

  const mk = async (name: string) => {
    const res = await app.request("/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, category: "X", price_cents: 100, color: "#16a34a" }),
    });
    return (await res.json()).id as number;
  };

  const soft = await mk("Soft");
  const hard = await mk("Hard");

  await app.request(`/catalog/${soft}`, { method: "DELETE" });
  await app.request(`/catalog/${hard}?permanent=1`, { method: "DELETE" });

  const all = await (await app.request("/catalog?all=1")).json();
  assertEquals(all.some((i: { id: number }) => i.id === soft), true); // hidden, still present
  assertEquals(all.some((i: { id: number }) => i.id === hard), false); // gone
  db.close();
});

Deno.test("migration adds color/description to an old-schema database", () => {
  // Build a DB with the early catalog_items schema (no color/description).
  const path = Deno.makeTempFileSync({ suffix: ".db" });
  const raw = new DatabaseSync(path);
  raw.exec(`
    CREATE TABLE catalog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      price_cents INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
  raw.prepare("INSERT INTO catalog_items (name, category, price_cents) VALUES (?, ?, ?)")
    .run("Legacy", "Sides", 500);
  raw.close();

  // Re-open with the current Database — migrate() should add the columns.
  const db = new Database(path);
  const items = db.listCatalog(true);
  const legacy = items.find((i) => i.name === "Legacy");
  assertEquals(legacy?.color, null);
  assertEquals(legacy?.description, null);
  // And updates to the new columns work afterward.
  const updated = db.updateCatalogItem(legacy!.id, { color: "#16a34a" });
  assertEquals(updated?.color, "#16a34a");
  db.close();

  try {
    Deno.removeSync(path);
    Deno.removeSync(path + "-wal");
    Deno.removeSync(path + "-shm");
  } catch { /* ignore */ }
});

Deno.test("a new sale is grouped under the local day (timezone regression)", () => {
  const db = freshDb();
  const sale = db.createSale({
    lines: [{ name: "Latte", unit_price_cents: 499, qty: 1 }],
    payment_type: "card",
  });
  // sale_date must be the LOCAL date, not the UTC slice of created_at.
  assertEquals(sale.sale_date, localDateString());

  // The sale (and its totals) must appear under "today" = local date. This was the
  // bug: created_at is UTC, so an evening local sale fell out of the local day.
  const { sales, totals } = db.listSalesForDay(localDateString());
  assertEquals(sales.some((s) => s.id === sale.id), true);
  assertEquals(totals.count, 1);
  assertEquals(totals.total_cents, sale.total_cents);
  db.close();
});

Deno.test("migration adds sale_date to an old-schema sales table and backfills", () => {
  const path = Deno.makeTempFileSync({ suffix: ".db" });
  const raw = new DatabaseSync(path);
  raw.exec(`
    CREATE TABLE sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      tax_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      payment_type TEXT NOT NULL,
      cash_tendered_cents INTEGER,
      change_cents INTEGER
    );
  `);
  raw.prepare(
    "INSERT INTO sales (created_at, subtotal_cents, tax_cents, total_cents, payment_type) VALUES (?, ?, ?, ?, ?)",
  ).run("2026-01-15T18:00:00.000Z", 10000, 0, 10000, "cash");
  raw.close();

  const db = new Database(path);
  const { sales } = db.listSalesForDay("2026-01-15"); // backfilled from created_at
  assertEquals(sales.length, 1);
  db.close();

  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      Deno.removeSync(path + suffix);
    } catch { /* ignore */ }
  }
});

Deno.test("backupDaily writes one snapshot per day, prunes, and skips :memory:", () => {
  // :memory: must be a no-op (no throw, nothing to write).
  const mem = new Database(":memory:");
  mem.backupDaily();
  mem.close();

  const dir = Deno.makeTempDirSync();
  const dbPath = `${dir}/bee-pos.db`;
  const db = new Database(dbPath); // constructor runs backupDaily once
  const backupsDir = `${dir}/backups`;

  const todaysBackup = `${backupsDir}/bee-pos-${localDateString()}.db`;
  assertEquals(Deno.statSync(todaysBackup).isFile, true);
  // It's a valid SQLite DB with our schema.
  const restored = new DatabaseSync(todaysBackup);
  const n = restored.prepare("SELECT COUNT(*) AS n FROM catalog_items").get() as { n: number };
  assertEquals(n.n > 0, true);
  restored.close();

  // Running again the same day does not create a duplicate (still one snapshot).
  db.backupDaily();
  const count = [...Deno.readDirSync(backupsDir)].filter((e) => e.isFile).length;
  assertEquals(count, 1);

  // Pruning keeps only the newest maxKeep snapshots.
  for (const d of ["2025-01-01", "2025-01-02", "2025-01-03"]) {
    Deno.writeTextFileSync(`${backupsDir}/bee-pos-${d}.db`, "stub");
  }
  db.backupDaily(2);
  const remaining = [...Deno.readDirSync(backupsDir)].map((e) => e.name).sort();
  assertEquals(remaining.length, 2);
  // Newest two by date: the old stubs are dropped, today's snapshot is kept.
  assertEquals(remaining.includes(`bee-pos-${localDateString()}.db`), true);
  db.close();

  Deno.removeSync(dir, { recursive: true });
});

Deno.test("dashboard('today') sums today and compares to yesterday", () => {
  const db = freshDb();
  const today = localDateString();
  const yesterday = dateMinusDays(today, 1);
  insertSaleOn(db, today, 10000, "cash", 2);
  insertSaleOn(db, today, 5000, "card", 1);
  insertSaleOn(db, yesterday, 20000, "cash", 1);

  const d = db.dashboard("today");
  assertEquals(d.kpi.revenue_cents, 15000);
  assertEquals(d.kpi.count, 2);
  assertEquals(d.kpi.cash_cents, 10000);
  assertEquals(d.kpi.card_cents, 5000);
  assertEquals(d.kpi.items_sold, 3);
  assertEquals(d.kpi.avg_ticket_cents, 7500);
  // Previous window = yesterday.
  assertEquals(d.prev.revenue_cents, 20000);
  assertEquals(d.prev.count, 1);
  // Spark always 7 points for "today", ending today.
  assertEquals(d.daily.length, 7);
  assertEquals(d.daily[d.daily.length - 1].date, today);
  assertEquals(d.daily[d.daily.length - 1].revenue_cents, 15000);
  assertEquals(d.recent.length, 2);
  db.close();
});

Deno.test("dashboard('7d') aggregates the whole week and prior week", () => {
  const db = freshDb();
  const today = localDateString();
  insertSaleOn(db, today, 10000, "cash");
  insertSaleOn(db, dateMinusDays(today, 3), 5000, "card");
  // Falls in the previous 7-day window (8 days ago).
  insertSaleOn(db, dateMinusDays(today, 8), 9999, "cash");

  const d = db.dashboard("7d");
  assertEquals(d.daily.length, 7);
  assertEquals(d.kpi.revenue_cents, 15000);
  assertEquals(d.kpi.count, 2);
  assertEquals(d.prev.revenue_cents, 9999);
  assertEquals(d.prev.count, 1);
  db.close();
});

Deno.test("dashboard('30d') returns a 30-point daily series", () => {
  const db = freshDb();
  const today = localDateString();
  insertSaleOn(db, today, 1000, "cash");
  insertSaleOn(db, dateMinusDays(today, 29), 2000, "card");
  insertSaleOn(db, dateMinusDays(today, 30), 4000, "cash"); // just outside → prev window

  const d = db.dashboard("30d");
  assertEquals(d.daily.length, 30);
  assertEquals(d.kpi.revenue_cents, 3000);
  assertEquals(d.kpi.count, 2);
  assertEquals(d.prev.revenue_cents, 4000);
  db.close();
});

Deno.test("dashboard handles an empty range with no divide-by-zero", () => {
  const db = freshDb();
  const d = db.dashboard("today");
  assertEquals(d.kpi.revenue_cents, 0);
  assertEquals(d.kpi.count, 0);
  assertEquals(d.kpi.items_sold, 0);
  assertEquals(d.kpi.avg_ticket_cents, 0);
  assertEquals(d.daily.length, 7);
  assertEquals(d.recent.length, 0);
  db.close();
});

Deno.test("HTTP GET /sales/dashboard returns the expected shape", async () => {
  const db = freshDb();
  insertSaleOn(db, localDateString(), 12345, "card", 2);
  const app = createApp(db);

  const res = await app.request("/sales/dashboard?range=7d");
  assertEquals(res.status, 200);
  const d = await res.json();
  assertEquals(d.range, "7d");
  assertEquals(d.kpi.revenue_cents, 12345);
  assertEquals(d.kpi.items_sold, 2);
  assertEquals(Array.isArray(d.daily), true);
  assertEquals(d.daily.length, 7);

  // Unknown range falls back to today.
  const res2 = await app.request("/sales/dashboard?range=bogus");
  assertEquals((await res2.json()).range, "today");
  db.close();
});
