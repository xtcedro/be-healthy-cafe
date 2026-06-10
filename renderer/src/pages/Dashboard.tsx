import { useEffect, useState } from "react";
import { api, dollars } from "../api";
import type { DashboardData, DashboardKpi, DashboardRange } from "../types";
import { useCountUp } from "../hooks/useCountUp";

const RANGES: Array<{ id: DashboardRange; label: string; deltaLabel: string }> =
  [
    { id: "today", label: "Today", deltaLabel: "vs yesterday" },
    { id: "7d", label: "Last 7 Days", deltaLabel: "vs prior 7 days" },
    { id: "30d", label: "Last 30 Days", deltaLabel: "vs prior 30 days" },
  ];

// Owner command-center dashboard. Headline KPIs animate on range change; everything
// is fed by GET /sales/dashboard?range=.
export function Dashboard() {
  const [range, setRange] = useState<DashboardRange>("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  function reload(r: DashboardRange) {
    api.dashboard(r).then(setData).catch((e) => setError(e.message));
  }
  useEffect(() => reload(range), [range]);

  const rangeMeta = RANGES.find((r) => r.id === range)!;
  const kpi = data?.kpi;
  const prev = data?.prev;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-pos-lg font-extrabold tracking-tight">
            Dashboard
          </h2>
          <span className="text-pos-sm text-slate-400">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-800 p-1 ring-1 ring-slate-700">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-lg px-4 py-2 text-pos-sm font-bold transition ${
                  range === r.id
                    ? "bg-white text-slate-900 shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => reload(range)}
            className="rounded-xl bg-slate-800 px-4 py-2 text-pos-sm font-bold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-pos-sm font-bold text-red-400">{error}</p>
      )}

      {/* Hero KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={kpi?.revenue_cents ?? 0}
          prev={prev?.revenue_cents ?? 0}
          format="money"
          deltaLabel={rangeMeta.deltaLabel}
          gradient="from-emerald-500/20 to-emerald-500/5"
          ring="ring-emerald-500/30"
          accent="text-emerald-400"
        />
        <KpiCard
          label="Orders"
          value={kpi?.count ?? 0}
          prev={prev?.count ?? 0}
          format="count"
          deltaLabel={rangeMeta.deltaLabel}
          gradient="from-sky-500/20 to-sky-500/5"
          ring="ring-sky-500/30"
          accent="text-sky-400"
        />
        <KpiCard
          label="Avg Ticket"
          value={kpi?.avg_ticket_cents ?? 0}
          prev={prev?.avg_ticket_cents ?? 0}
          format="money"
          deltaLabel={rangeMeta.deltaLabel}
          gradient="from-violet-500/20 to-violet-500/5"
          ring="ring-violet-500/30"
          accent="text-violet-400"
        />
        <KpiCard
          label="Items Sold"
          value={kpi?.items_sold ?? 0}
          prev={prev?.items_sold ?? 0}
          format="count"
          deltaLabel={rangeMeta.deltaLabel}
          gradient="from-amber-500/20 to-amber-500/5"
          ring="ring-amber-500/30"
          accent="text-amber-400"
        />
      </div>

      {/* Sparkline + payment mix */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-slate-900/70 p-5 ring-1 ring-slate-800 lg:col-span-2">
          <h3 className="mb-3 text-pos-sm font-bold uppercase tracking-wide text-slate-400">
            Revenue — last {data?.daily.length ?? 0} days
          </h3>
          <Sparkline daily={data?.daily ?? []} />
        </div>
        <div className="rounded-2xl bg-slate-900/70 p-5 ring-1 ring-slate-800">
          <h3 className="mb-4 text-pos-sm font-bold uppercase tracking-wide text-slate-400">
            Payment Mix
          </h3>
          <PaymentMix kpi={kpi} />
        </div>
      </div>

      {/* Recent sales */}
      <div className="overflow-hidden rounded-2xl ring-1 ring-slate-800">
        <div className="flex items-center justify-between bg-slate-900/70 px-5 py-3">
          <h3 className="text-pos-base font-bold">Recent Orders</h3>
          <span className="text-pos-sm text-slate-400">
            {data?.recent.length ?? 0} shown
          </span>
        </div>
        <table className="w-full">
          <thead className="bg-slate-800/60 text-left text-pos-sm text-slate-400">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recent ?? []).map((s) => (
              <tr
                key={s.id}
                className="border-t border-slate-800 text-pos-base"
              >
                <td className="px-4 py-3 font-bold">{s.id}</td>
                <td className="px-4 py-3 text-slate-300">
                  {new Date(s.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-pos-sm font-bold ${
                      s.payment_type === "cash"
                        ? "bg-emerald-900 text-emerald-200"
                        : "bg-sky-900 text-sky-200"
                    }`}
                  >
                    {s.payment_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-emerald-400">
                  {dollars(s.total_cents)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => reprint(s.id)}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-pos-sm font-bold hover:bg-slate-600"
                  >
                    Print
                  </button>
                </td>
              </tr>
            ))}
            {data && data.recent.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="bg-slate-900/40 px-4 py-10 text-center text-pos-base text-slate-500"
                >
                  No orders in this period yet — they'll appear here as you ring
                  them up.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function reprint(saleId: number) {
  const html = await api.receiptHtml(saleId);
  if (window.pos?.printReceipt) await window.pos.printReceipt(html);
  else window.print();
}

function KpiCard(
  { label, value, prev, format, deltaLabel, gradient, ring, accent }: {
    label: string;
    value: number;
    prev: number;
    format: "money" | "count";
    deltaLabel: string;
    gradient: string;
    ring: string;
    accent: string;
  },
) {
  const animated = useCountUp(value);
  const display = format === "money"
    ? dollars(Math.round(animated))
    : Math.round(animated).toLocaleString("en-US");

  const delta = prev > 0 ? ((value - prev) / prev) * 100 : value > 0 ? 100 : 0;
  const up = delta > 0.5;
  const down = delta < -0.5;
  const deltaColor = up
    ? "text-emerald-400"
    : down
    ? "text-red-400"
    : "text-slate-400";
  const arrow = up ? "▲" : down ? "▼" : "—";

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${gradient} p-5 ring-1 ${ring} shadow-lg`}
    >
      <div className="text-pos-sm font-bold uppercase tracking-wide text-slate-300">
        {label}
      </div>
      <div className={`mt-2 text-pos-2xl font-extrabold ${accent}`}>
        {display}
      </div>
      <div className={`mt-1 text-pos-sm font-bold ${deltaColor}`}>
        {arrow} {Math.abs(delta).toFixed(0)}%{" "}
        <span className="font-normal text-slate-400">{deltaLabel}</span>
      </div>
    </div>
  );
}

function Sparkline(
  { daily }: {
    daily: Array<{ date: string; revenue_cents: number; count: number }>;
  },
) {
  if (daily.length === 0) {
    return <div className="h-32 animate-pulse rounded-xl bg-slate-800/50" />;
  }
  const W = 100;
  const H = 36;
  const gap = 1.5;
  const max = Math.max(1, ...daily.map((d) => d.revenue_cents));
  const bw = (W - gap * (daily.length - 1)) / daily.length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-32 w-full"
    >
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {daily.map((d, i) => {
        const h = (d.revenue_cents / max) * (H - 2);
        const x = i * (bw + gap);
        const y = H - h;
        const last = i === daily.length - 1;
        return (
          <rect
            key={d.date}
            x={x}
            y={y}
            width={bw}
            height={Math.max(h, d.revenue_cents > 0 ? 0.8 : 0)}
            rx={0.6}
            fill={last ? "#a7f3d0" : "url(#barGrad)"}
          >
            <title>
              {`${d.date}: ${dollars(d.revenue_cents)} (${d.count} orders)`}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

function PaymentMix({ kpi }: { kpi?: DashboardKpi }) {
  const cash = kpi?.cash_cents ?? 0;
  const card = kpi?.card_cents ?? 0;
  const total = cash + card;
  const cashPct = total > 0 ? Math.round((cash / total) * 100) : 0;
  const cardPct = total > 0 ? 100 - cashPct : 0;

  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-full bg-slate-800">
        <div className="bg-emerald-500" style={{ width: `${cashPct}%` }} />
        <div className="bg-sky-500" style={{ width: `${cardPct}%` }} />
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-pos-base">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500" /> Cash
          </span>
          <span className="font-bold">{dollars(cash)} · {cashPct}%</span>
        </div>
        <div className="flex items-center justify-between text-pos-base">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-sky-500" /> Card
          </span>
          <span className="font-bold">{dollars(card)} · {cardPct}%</span>
        </div>
      </div>
    </div>
  );
}
