// SQLite data layer for the Bee Healthy Cafe POS.
//
// Uses node:sqlite (built into Deno 2.x) so there is no native build step and the
// whole backend can be `deno compile`d into a single Windows executable. The DB is
// a single file on disk — true local-first, works fully offline.

import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";

export type PaymentType = "cash" | "card";

export interface CatalogItem {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  active: number; // 0 | 1
  color: string | null; // hex button color on the register, or null for default
  description: string | null; // optional note (e.g. "kale, spinach, banana")
}

export interface SaleLineInput {
  name: string;
  unit_price_cents: number;
  qty: number;
}

export interface SaleLineItem extends SaleLineInput {
  id: number;
  sale_id: number;
  line_total_cents: number;
}

export interface Sale {
  id: number;
  created_at: string; // UTC ISO timestamp (used for display)
  sale_date: string; // local YYYY-MM-DD (used for "which day" grouping)
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_type: PaymentType;
  cash_tendered_cents: number | null;
  change_cents: number | null;
}

// Local calendar date as YYYY-MM-DD. Used to group sales by the cafe's local day,
// independent of the UTC timestamp stored in created_at.
export function localDateString(date: Date = new Date()): string {
  const off = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - off).toISOString().slice(0, 10);
}

// Returns the YYYY-MM-DD that is `n` days before the given YYYY-MM-DD (UTC-noon math
// avoids any DST edge cases while keeping calendar-day arithmetic exact).
export function dateMinusDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export type DashboardRange = "today" | "7d" | "30d";

export interface DashboardKpi {
  revenue_cents: number;
  count: number;
  cash_cents: number;
  card_cents: number;
  items_sold: number;
  avg_ticket_cents: number;
}

export interface DashboardData {
  range: DashboardRange;
  start: string;
  end: string;
  kpi: DashboardKpi;
  prev: DashboardKpi;
  daily: Array<{ date: string; revenue_cents: number; count: number }>;
  recent: Sale[];
}

export interface SaleWithLines extends Sale {
  lines: SaleLineItem[];
}

// Sensible Oklahoma City default: 4.5% state + 4.125% city = 8.625% combined.
// Editable in Settings — rates change, so this is a default, never a hard rule.
const DEFAULT_TAX_RATE = "0.08625";

// Fresh-install menu for Bee Healthy Cafe (Oklahoma City). Prices in integer cents.
// Categories and button colors are tuned for a fast counter: smoothies green, acai
// bowls violet, coffee brown, breakfast amber, wraps teal, bowls leaf-green, etc.
// The owner edits all of this in the Items screen — this is just a friendly start.
const SEED_CATALOG: Array<
  Pick<CatalogItem, "name" | "category" | "price_cents"> & {
    color?: string;
    description?: string;
  }
> = [
  // --- Smoothies ---
  { name: "Strawberry Banana", category: "Smoothies", price_cents: 749, color: "#16a34a" },
  { name: "Berry Blast", category: "Smoothies", price_cents: 749, color: "#16a34a" },
  { name: "Mango Tango", category: "Smoothies", price_cents: 749, color: "#16a34a" },
  {
    name: "Green Machine",
    category: "Smoothies",
    price_cents: 799,
    color: "#16a34a",
    description: "Kale, spinach, banana, apple",
  },
  { name: "Peanut Butter Power", category: "Smoothies", price_cents: 799, color: "#16a34a" },
  { name: "Tropical Sunrise", category: "Smoothies", price_cents: 749, color: "#16a34a" },

  // --- Acai Bowls ---
  { name: "Classic Acai Bowl", category: "Acai Bowls", price_cents: 999, color: "#7c3aed" },
  { name: "PB Acai Bowl", category: "Acai Bowls", price_cents: 1049, color: "#7c3aed" },
  { name: "Build-Your-Own Bowl", category: "Acai Bowls", price_cents: 1099, color: "#7c3aed" },

  // --- Coffee ---
  { name: "Drip Coffee", category: "Coffee", price_cents: 299, color: "#92400e" },
  { name: "Latte", category: "Coffee", price_cents: 499, color: "#92400e" },
  { name: "Cappuccino", category: "Coffee", price_cents: 449, color: "#92400e" },
  { name: "Americano", category: "Coffee", price_cents: 349, color: "#92400e" },
  { name: "Chai Latte", category: "Coffee", price_cents: 499, color: "#92400e" },
  { name: "Matcha Latte", category: "Coffee", price_cents: 549, color: "#92400e" },
  { name: "Cold Brew", category: "Coffee", price_cents: 449, color: "#92400e" },

  // --- Breakfast ---
  { name: "Avocado Toast", category: "Breakfast", price_cents: 799, color: "#d97706" },
  { name: "Peanut Butter Toast", category: "Breakfast", price_cents: 599, color: "#d97706" },
  { name: "Breakfast Burrito", category: "Breakfast", price_cents: 849, color: "#d97706" },
  { name: "Breakfast Bowl", category: "Breakfast", price_cents: 899, color: "#d97706" },
  { name: "Yogurt Parfait", category: "Breakfast", price_cents: 649, color: "#d97706" },

  // --- Wraps ---
  { name: "California Wrap", category: "Wraps", price_cents: 999, color: "#0d9488" },
  { name: "Baja Wrap", category: "Wraps", price_cents: 1049, color: "#0d9488" },
  { name: "Buffalo Chicken Wrap", category: "Wraps", price_cents: 1099, color: "#0d9488" },
  { name: "Black Bean Wrap", category: "Wraps", price_cents: 949, color: "#0d9488" },

  // --- Bowls ---
  { name: "Pick Your Protein Bowl", category: "Bowls", price_cents: 1199, color: "#15803d" },
  { name: "Sesame Thai Bowl", category: "Bowls", price_cents: 1149, color: "#15803d" },
  { name: "Greek Bowl", category: "Bowls", price_cents: 1099, color: "#15803d" },
  { name: "Chipotle Bowl", category: "Bowls", price_cents: 1149, color: "#15803d" },

  // --- Salads ---
  { name: "Greek Salad", category: "Salads", price_cents: 999, color: "#65a30d" },
  { name: "Cobb Salad", category: "Salads", price_cents: 1049, color: "#65a30d" },
  { name: "Garden Salad", category: "Salads", price_cents: 849, color: "#65a30d" },

  // --- Sides ---
  { name: "Chips & Salsa", category: "Sides", price_cents: 399, color: "#0369a1" },
  { name: "Hummus & Chips", category: "Sides", price_cents: 549, color: "#0369a1" },
  { name: "Cup of Soup", category: "Sides", price_cents: 449, color: "#0369a1" },
  { name: "Bowl of Chili", category: "Sides", price_cents: 549, color: "#0369a1" },

  // --- Add-ons ---
  { name: "Protein Boost", category: "Add-ons", price_cents: 150, color: "#a16207" },
  { name: "Extra Avocado", category: "Add-ons", price_cents: 199, color: "#a16207" },
  { name: "Almond Milk", category: "Add-ons", price_cents: 75, color: "#a16207" },
  { name: "Espresso Shot", category: "Add-ons", price_cents: 100, color: "#a16207" },
];

export class Database {
  readonly db: DatabaseSync;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
    this.seed();
    // A backup must never block the register from opening.
    try {
      this.backupDaily();
    } catch (err) {
      console.error("[backup] daily backup failed:", err);
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalog_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'General',
        price_cents INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS sales (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at          TEXT NOT NULL,
        subtotal_cents      INTEGER NOT NULL,
        tax_cents           INTEGER NOT NULL,
        total_cents         INTEGER NOT NULL,
        payment_type        TEXT NOT NULL CHECK (payment_type IN ('cash','card')),
        cash_tendered_cents INTEGER,
        change_cents        INTEGER
      );

      CREATE TABLE IF NOT EXISTS sale_line_items (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id          INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        qty              INTEGER NOT NULL,
        line_total_cents INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_line_items_sale ON sale_line_items(sale_id);
    `);

    // Additive, idempotent column migrations for databases created by older
    // versions (installed copies already hold the cafe's data).
    this.addColumnIfMissing("catalog_items", "color", "TEXT");
    this.addColumnIfMissing("catalog_items", "description", "TEXT");

    // sale_date: local calendar day for grouping. created_at remains UTC. Backfill
    // existing rows from created_at (close enough for history; new rows are exact).
    this.addColumnIfMissing("sales", "sale_date", "TEXT");
    this.db.exec(
      "UPDATE sales SET sale_date = substr(created_at, 1, 10) WHERE sale_date IS NULL",
    );
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date)");
  }

  private addColumnIfMissing(table: string, column: string, type: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<
      { name: string }
    >;
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }

  // Writes one consistent snapshot per local day to <db-dir>/backups, retaining the
  // newest `maxKeep`. Uses a WAL checkpoint + file copy so the snapshot is valid even
  // while WAL is active. Not for in-memory databases (tests).
  backupDaily(maxKeep = 14): void {
    if (this.path === ":memory:") return;

    const dir = join(dirname(this.path), "backups");
    Deno.mkdirSync(dir, { recursive: true });

    const target = join(dir, `bee-pos-${localDateString()}.db`);
    let exists = true;
    try {
      Deno.statSync(target);
    } catch {
      exists = false;
    }
    if (!exists) {
      // node:sqlite doesn't support `VACUUM INTO` (attached-db limit is 0), so flush
      // the WAL into the main file and copy that — a consistent standalone snapshot.
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      Deno.copyFileSync(this.path, target);
    }

    // Prune to the newest maxKeep snapshots (names sort chronologically by date).
    const snapshots = [...Deno.readDirSync(dir)]
      .filter((e) => e.isFile && /^bee-pos-\d{4}-\d{2}-\d{2}\.db$/.test(e.name))
      .map((e) => e.name)
      .sort();
    for (const name of snapshots.slice(0, Math.max(0, snapshots.length - maxKeep))) {
      try {
        Deno.removeSync(join(dir, name));
      } catch { /* ignore */ }
    }
  }

  private seed(): void {
    const defaults: Record<string, string> = {
      tax_rate: DEFAULT_TAX_RATE,
      shop_name: "Bee Healthy Cafe",
      shop_address: "Oklahoma City, OK",
      shop_phone: "",
    };
    const insertSetting = this.db.prepare(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
    );
    for (const [key, value] of Object.entries(defaults)) {
      insertSetting.run(key, value);
    }

    const count = this.db.prepare("SELECT COUNT(*) AS n FROM catalog_items")
      .get() as { n: number };
    if (count.n === 0) {
      const insertItem = this.db.prepare(
        "INSERT INTO catalog_items (name, category, price_cents, color, description) VALUES (?, ?, ?, ?, ?)",
      );
      for (const item of SEED_CATALOG) {
        insertItem.run(
          item.name,
          item.category,
          item.price_cents,
          item.color ?? null,
          item.description ?? null,
        );
      }
    }
  }

  // ---- Settings -------------------------------------------------------------

  getSettings(): Record<string, string> {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<
      { key: string; value: string }
    >;
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  getTaxRate(): number {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'")
      .get() as { value: string } | undefined;
    const rate = row ? Number(row.value) : Number(DEFAULT_TAX_RATE);
    return Number.isFinite(rate) && rate >= 0 ? rate : Number(DEFAULT_TAX_RATE);
  }

  updateSettings(updates: Record<string, string>): Record<string, string> {
    const stmt = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, String(value));
    }
    return this.getSettings();
  }

  // ---- Catalog --------------------------------------------------------------

  listCatalog(includeInactive = false): CatalogItem[] {
    const sql = includeInactive
      ? "SELECT * FROM catalog_items ORDER BY category, name"
      : "SELECT * FROM catalog_items WHERE active = 1 ORDER BY category, name";
    return this.db.prepare(sql).all() as unknown as CatalogItem[];
  }

  createCatalogItem(
    item: Pick<CatalogItem, "name" | "category" | "price_cents"> &
      Partial<Pick<CatalogItem, "color" | "description">>,
  ): CatalogItem {
    const result = this.db.prepare(
      "INSERT INTO catalog_items (name, category, price_cents, color, description) VALUES (?, ?, ?, ?, ?)",
    ).run(
      item.name,
      item.category,
      item.price_cents,
      item.color ?? null,
      item.description ?? null,
    );
    return this.db.prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(result.lastInsertRowid as number) as unknown as CatalogItem;
  }

  updateCatalogItem(
    id: number,
    item: Partial<
      Pick<CatalogItem, "name" | "category" | "price_cents" | "active" | "color" | "description">
    >,
  ): CatalogItem | undefined {
    const existing = this.db.prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(id) as CatalogItem | undefined;
    if (!existing) return undefined;
    const merged = { ...existing, ...item };
    this.db.prepare(
      "UPDATE catalog_items SET name = ?, category = ?, price_cents = ?, active = ?, color = ?, description = ? WHERE id = ?",
    ).run(
      merged.name,
      merged.category,
      merged.price_cents,
      merged.active,
      merged.color ?? null,
      merged.description ?? null,
      id,
    );
    return this.db.prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(id) as unknown as CatalogItem;
  }

  deleteCatalogItem(id: number): boolean {
    // Soft-delete: keep the row so historical sales referencing the name stay sane,
    // but hide it from the register.
    const result = this.db.prepare(
      "UPDATE catalog_items SET active = 0 WHERE id = ?",
    ).run(id);
    return result.changes > 0;
  }

  purgeCatalogItem(id: number): boolean {
    // Permanent delete. Safe because each sale stores its own snapshot of the
    // item's name/price in sale_line_items, so past sales are unaffected.
    const result = this.db.prepare(
      "DELETE FROM catalog_items WHERE id = ?",
    ).run(id);
    return result.changes > 0;
  }

  // ---- Sales ----------------------------------------------------------------

  // Totals are ALWAYS recomputed here from the line items and the stored tax rate.
  // The client's numbers are never trusted.
  createSale(input: {
    lines: SaleLineInput[];
    payment_type: PaymentType;
    cash_tendered_cents?: number | null;
  }): SaleWithLines {
    if (!input.lines || input.lines.length === 0) {
      throw new Error("A sale must have at least one line item.");
    }

    const totals = computeTotals(input.lines, this.getTaxRate());
    const now = new Date();
    const createdAt = now.toISOString();
    const saleDate = localDateString(now);

    let cashTendered: number | null = null;
    let change: number | null = null;
    if (input.payment_type === "cash") {
      cashTendered = input.cash_tendered_cents ?? totals.total_cents;
      change = Math.max(0, cashTendered - totals.total_cents);
    }

    const insertSale = this.db.prepare(
      `INSERT INTO sales
        (created_at, sale_date, subtotal_cents, tax_cents, total_cents, payment_type, cash_tendered_cents, change_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLine = this.db.prepare(
      `INSERT INTO sale_line_items
        (sale_id, name, unit_price_cents, qty, line_total_cents)
       VALUES (?, ?, ?, ?, ?)`,
    );

    // Wrap the sale + its lines in a transaction so a partial write can't happen.
    this.db.exec("BEGIN");
    let saleId: number;
    try {
      const result = insertSale.run(
        createdAt,
        saleDate,
        totals.subtotal_cents,
        totals.tax_cents,
        totals.total_cents,
        input.payment_type,
        cashTendered,
        change,
      );
      saleId = result.lastInsertRowid as number;
      for (const line of input.lines) {
        insertLine.run(
          saleId,
          line.name,
          line.unit_price_cents,
          line.qty,
          line.unit_price_cents * line.qty,
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }

    return this.getSale(saleId)!;
  }

  getSale(id: number): SaleWithLines | undefined {
    const sale = this.db.prepare("SELECT * FROM sales WHERE id = ?").get(id) as
      | Sale
      | undefined;
    if (!sale) return undefined;
    const lines = this.db.prepare(
      "SELECT * FROM sale_line_items WHERE sale_id = ? ORDER BY id",
    ).all(id) as unknown as SaleLineItem[];
    return { ...sale, lines };
  }

  // Returns sales for a single calendar day (local YYYY-MM-DD) plus payment totals.
  listSalesForDay(day: string): {
    sales: Sale[];
    totals: { cash_cents: number; card_cents: number; total_cents: number; count: number };
  } {
    const sales = this.db.prepare(
      "SELECT * FROM sales WHERE sale_date = ? ORDER BY created_at DESC",
    ).all(day) as unknown as Sale[];

    const totals = sales.reduce(
      (acc, s) => {
        acc.total_cents += s.total_cents;
        if (s.payment_type === "cash") acc.cash_cents += s.total_cents;
        else acc.card_cents += s.total_cents;
        acc.count += 1;
        return acc;
      },
      { cash_cents: 0, card_cents: 0, total_cents: 0, count: 0 },
    );

    return { sales, totals };
  }

  // Aggregated metrics for the owner dashboard over a named range. Everything is
  // derived from the existing sales / sale_line_items tables.
  dashboard(range: DashboardRange): DashboardData {
    // Headline window length in days, and the sparkline series length.
    const windowDays = range === "today" ? 1 : range === "7d" ? 7 : 30;
    const sparkDays = range === "today" ? 7 : windowDays;

    const today = localDateString();
    const start = dateMinusDays(today, windowDays - 1); // inclusive window start
    const prevEnd = dateMinusDays(start, 1);
    const prevStart = dateMinusDays(prevEnd, windowDays - 1);

    const kpi = this.kpiForWindow(start, today);
    const prev = this.kpiForWindow(prevStart, prevEnd);

    // Daily revenue series for the spark, oldest→newest, zero-filled.
    const sparkStart = dateMinusDays(today, sparkDays - 1);
    const rows = this.db.prepare(
      "SELECT sale_date AS date, SUM(total_cents) AS revenue_cents, COUNT(*) AS count " +
        "FROM sales WHERE sale_date BETWEEN ? AND ? GROUP BY sale_date",
    ).all(sparkStart, today) as unknown as Array<
      { date: string; revenue_cents: number; count: number }
    >;
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const daily: Array<{ date: string; revenue_cents: number; count: number }> = [];
    for (let i = sparkDays - 1; i >= 0; i--) {
      const date = dateMinusDays(today, i);
      const r = byDate.get(date);
      daily.push({ date, revenue_cents: r?.revenue_cents ?? 0, count: r?.count ?? 0 });
    }

    const recent = this.db.prepare(
      "SELECT * FROM sales WHERE sale_date BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50",
    ).all(start, today) as unknown as Sale[];

    return { range, start, end: today, kpi, prev, daily, recent };
  }

  private kpiForWindow(start: string, end: string): DashboardKpi {
    const agg = this.db.prepare(
      "SELECT " +
        "COALESCE(SUM(total_cents),0) AS revenue_cents, " +
        "COUNT(*) AS count, " +
        "COALESCE(SUM(CASE WHEN payment_type='cash' THEN total_cents ELSE 0 END),0) AS cash_cents, " +
        "COALESCE(SUM(CASE WHEN payment_type='card' THEN total_cents ELSE 0 END),0) AS card_cents " +
        "FROM sales WHERE sale_date BETWEEN ? AND ?",
    ).get(start, end) as {
      revenue_cents: number;
      count: number;
      cash_cents: number;
      card_cents: number;
    };

    const itemsRow = this.db.prepare(
      "SELECT COALESCE(SUM(li.qty),0) AS items_sold " +
        "FROM sale_line_items li JOIN sales s ON li.sale_id = s.id " +
        "WHERE s.sale_date BETWEEN ? AND ?",
    ).get(start, end) as { items_sold: number };

    return {
      revenue_cents: agg.revenue_cents,
      count: agg.count,
      cash_cents: agg.cash_cents,
      card_cents: agg.card_cents,
      items_sold: itemsRow.items_sold,
      avg_ticket_cents: agg.count ? Math.round(agg.revenue_cents / agg.count) : 0,
    };
  }

  close(): void {
    this.db.close();
  }
}

// Pure total calculation, exported so tests can assert it directly.
// Tax is computed on the subtotal and rounded to the nearest cent.
export function computeTotals(
  lines: SaleLineInput[],
  taxRate: number,
): { subtotal_cents: number; tax_cents: number; total_cents: number } {
  const subtotal_cents = lines.reduce(
    (sum, l) => sum + Math.round(l.unit_price_cents) * Math.round(l.qty),
    0,
  );
  const tax_cents = Math.round(subtotal_cents * taxRate);
  const total_cents = subtotal_cents + tax_cents;
  return { subtotal_cents, tax_cents, total_cents };
}
