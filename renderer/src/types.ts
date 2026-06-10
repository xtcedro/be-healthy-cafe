// Shared types mirrored from the backend (kept small and hand-synced).

export type PaymentType = "cash" | "card";

export interface CatalogItem {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  active: number;
  color: string | null;
  description: string | null;
}

export interface SaleLineItem {
  id: number;
  sale_id: number;
  name: string;
  unit_price_cents: number;
  qty: number;
  line_total_cents: number;
}

export interface Sale {
  id: number;
  created_at: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_type: PaymentType;
  cash_tendered_cents: number | null;
  change_cents: number | null;
}

export interface SaleWithLines extends Sale {
  lines: SaleLineItem[];
}

export interface DailySales {
  sales: Sale[];
  totals: {
    cash_cents: number;
    card_cents: number;
    total_cents: number;
    count: number;
  };
}

export type Settings = Record<string, string>;

// ---- Dashboard ----

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

// A line in the in-progress cart (not yet a sale).
export interface CartLine {
  name: string;
  unit_price_cents: number;
  qty: number;
}
