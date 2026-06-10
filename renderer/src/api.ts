// Thin fetch wrapper around the localhost Deno backend. The base URL (with the
// chosen port) is provided by the Electron preload as window.pos.backendBaseUrl.

import type {
  CartLine,
  CatalogItem,
  DailySales,
  DashboardData,
  DashboardRange,
  PaymentType,
  SaleWithLines,
  Settings,
} from "./types";

declare global {
  interface Window {
    pos?: {
      backendPort: string;
      backendBaseUrl: string;
      printReceipt: (html: string) => Promise<{ ok: boolean; error?: string }>;
      saveReceiptPdf: (
        html: string,
        suggestedName: string,
      ) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
    };
  }
}

// Fall back to a query param / localhost for running the renderer in a plain
// browser during development without Electron.
function baseUrl(): string {
  if (window.pos?.backendBaseUrl) return window.pos.backendBaseUrl;
  const port = new URLSearchParams(window.location.search).get("port");
  return port ? `http://127.0.0.1:${port}` : "http://127.0.0.1:8000";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(baseUrl() + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Catalog
  listCatalog: (all = false): Promise<CatalogItem[]> =>
    request(`/catalog${all ? "?all=1" : ""}`),
  createCatalogItem: (item: {
    name: string;
    category: string;
    price_cents: number;
    color?: string | null;
    description?: string | null;
  }) => request<CatalogItem>("/catalog", { method: "POST", body: JSON.stringify(item) }),
  updateCatalogItem: (id: number, item: Partial<CatalogItem>) =>
    request<CatalogItem>(`/catalog/${id}`, { method: "PUT", body: JSON.stringify(item) }),
  // Soft-hide (keeps the row, hides it from the register).
  deleteCatalogItem: (id: number) =>
    request<{ ok: boolean }>(`/catalog/${id}`, { method: "DELETE" }),
  // Permanent delete (removes the row entirely).
  purgeCatalogItem: (id: number) =>
    request<{ ok: boolean }>(`/catalog/${id}?permanent=1`, { method: "DELETE" }),

  // Sales
  createSale: (input: {
    lines: CartLine[];
    payment_type: PaymentType;
    cash_tendered_cents?: number | null;
  }): Promise<SaleWithLines> =>
    request("/sales", { method: "POST", body: JSON.stringify(input) }),
  salesToday: (): Promise<DailySales> => request("/sales?date=today"),
  dashboard: (range: DashboardRange): Promise<DashboardData> =>
    request(`/sales/dashboard?range=${range}`),
  receiptHtml: async (saleId: number): Promise<string> => {
    const res = await fetch(`${baseUrl()}/sales/${saleId}/receipt`);
    return res.text();
  },

  // Settings
  getSettings: (): Promise<Settings> => request("/settings"),
  updateSettings: (updates: Settings): Promise<Settings> =>
    request("/settings", { method: "PUT", body: JSON.stringify(updates) }),
};

// Money helpers shared across the UI.
export function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function parseDollarsToCents(input: string): number {
  const n = Number(String(input).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
