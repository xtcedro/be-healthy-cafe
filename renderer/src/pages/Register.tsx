import { useEffect, useMemo, useState } from "react";
import { api, dollars, parseDollarsToCents } from "../api";
import type { CartLine, CatalogItem, SaleWithLines, Settings } from "../types";
import { Modal } from "../components/Modal";

// The primary checkout screen. Left: tap-to-add item buttons. Right: the cart,
// running totals, and payment. Designed for large touch targets and minimal text.
export function Register() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [payMode, setPayMode] = useState<null | "cash" | "card">(null);
  const [lastSale, setLastSale] = useState<SaleWithLines | null>(null);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const reload = () => {
    api.listCatalog().then(setCatalog).catch((e) => setError(e.message));
    api.getSettings().then(setSettings).catch(() => {});
  };
  useEffect(reload, []);

  const taxRate = Number(settings.tax_rate ?? "0.08625");
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.unit_price_cents * l.qty, 0);
    const tax = Math.round(subtotal * taxRate);
    return { subtotal, tax, total: subtotal + tax };
  }, [cart, taxRate]);

  function addItem(name: string, price: number) {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.name === name && l.unit_price_cents === price);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { name, unit_price_cents: price, qty: 1 }];
    });
  }

  function changeQty(idx: number, delta: number) {
    setCart((prev) => {
      const next = [...prev];
      const qty = next[idx].qty + delta;
      if (qty <= 0) next.splice(idx, 1);
      else next[idx] = { ...next[idx], qty };
      return next;
    });
  }

  function clearCart() {
    setCart([]);
    setError("");
  }

  async function completeSale(payment: "cash" | "card", cashTenderedCents?: number) {
    try {
      const sale = await api.createSale({
        lines: cart,
        payment_type: payment,
        cash_tendered_cents: cashTenderedCents ?? null,
      });
      setLastSale(sale);
      setCart([]);
      setPayMode(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Group catalog by category for tidy button sections.
  const grouped = useMemo(() => {
    const m = new Map<string, CatalogItem[]>();
    for (const it of catalog) {
      if (!m.has(it.category)) m.set(it.category, []);
      m.get(it.category)!.push(it);
    }
    return [...m.entries()];
  }, [catalog]);

  const categories = useMemo(() => ["All", ...grouped.map(([c]) => c)], [grouped]);
  const visibleGroups = categoryFilter === "All"
    ? grouped
    : grouped.filter(([c]) => c === categoryFilter);

  return (
    <div className="grid h-full grid-cols-[1fr_460px]">
      {/* Item buttons */}
      <section className="flex min-h-0 flex-col p-5">
        {/* Category filter tabs */}
        {categories.length > 2 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`rounded-full px-4 py-2 text-pos-sm font-bold transition ${
                  categoryFilter === c
                    ? "bg-white text-slate-900"
                    : "bg-slate-800 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleGroups.map(([category, items]) => (
            <div key={category} className="mb-6">
              <h3 className="mb-2 text-pos-sm font-bold uppercase tracking-wide text-slate-400">
                {category}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => addItem(it.name, it.price_cents)}
                    style={{ backgroundColor: it.color ?? undefined }}
                    className={`flex min-h-[96px] flex-col justify-between rounded-xl p-4 text-left text-white ring-1 ring-black/20 transition hover:brightness-110 active:scale-95 ${
                      it.color ? "" : "bg-slate-800 ring-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    <span className="text-pos-base font-bold leading-tight">{it.name}</span>
                    <span className="text-pos-sm font-bold text-white/90">{dollars(it.price_cents)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={() => setShowCustom(true)}
            className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-600 p-5 text-pos-base font-bold text-slate-300 hover:border-slate-400"
          >
            + Custom Item
          </button>
        </div>
      </section>

      {/* Cart + payment */}
      <aside className="flex flex-col border-l border-slate-700 bg-slate-950">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-pos-lg font-bold">Order</h2>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="rounded-lg bg-slate-800 px-4 py-2 text-pos-sm font-bold text-slate-300 hover:bg-slate-700"
            >
              Clear
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {cart.length === 0
            ? <p className="mt-10 text-center text-pos-base text-slate-500">Tap items to add</p>
            : cart.map((l, i) => (
              <div key={i} className="mb-2 flex items-center gap-3 rounded-xl bg-slate-900 p-3">
                <div className="flex-1">
                  <div className="text-pos-base font-bold">{l.name}</div>
                  <div className="text-pos-sm text-slate-400">{dollars(l.unit_price_cents)} each</div>
                </div>
                <button onClick={() => changeQty(i, -1)} className="h-11 w-11 rounded-lg bg-slate-700 text-pos-lg font-bold">−</button>
                <span className="w-8 text-center text-pos-base font-bold">{l.qty}</span>
                <button onClick={() => changeQty(i, +1)} className="h-11 w-11 rounded-lg bg-slate-700 text-pos-lg font-bold">+</button>
                <div className="w-24 text-right text-pos-base font-bold">{dollars(l.unit_price_cents * l.qty)}</div>
              </div>
            ))}
        </div>

        <div className="border-t border-slate-700 px-5 py-4">
          <Row label="Subtotal" value={dollars(totals.subtotal)} />
          <Row label={`Tax (${(taxRate * 100).toFixed(3)}%)`} value={dollars(totals.tax)} />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-pos-lg font-extrabold">Total</span>
            <span className="text-pos-2xl font-extrabold text-emerald-400">{dollars(totals.total)}</span>
          </div>

          {error && <p className="mt-2 text-pos-sm font-bold text-red-400">{error}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              disabled={cart.length === 0}
              onClick={() => setPayMode("cash")}
              className="rounded-xl bg-emerald-600 py-5 text-pos-lg font-extrabold disabled:opacity-30 enabled:hover:bg-emerald-500"
            >
              Cash
            </button>
            <button
              disabled={cart.length === 0}
              onClick={() => setPayMode("card")}
              className="rounded-xl bg-sky-600 py-5 text-pos-lg font-extrabold disabled:opacity-30 enabled:hover:bg-sky-500"
            >
              Card
            </button>
          </div>
        </div>
      </aside>

      {showCustom && (
        <CustomItemModal
          onClose={() => setShowCustom(false)}
          onAdd={(name, cents) => {
            addItem(name, cents);
            setShowCustom(false);
          }}
        />
      )}

      {payMode === "cash" && (
        <CashModal
          totalCents={totals.total}
          onClose={() => setPayMode(null)}
          onConfirm={(tendered) => completeSale("cash", tendered)}
        />
      )}

      {payMode === "card" && (
        <CardModal
          totalCents={totals.total}
          onClose={() => setPayMode(null)}
          onConfirm={() => completeSale("card")}
        />
      )}

      {lastSale && <ReceiptModal sale={lastSale} onClose={() => setLastSale(null)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-pos-base text-slate-300">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function CustomItemModal(
  { onAdd, onClose }: { onAdd: (name: string, cents: number) => void; onClose: () => void },
) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const cents = parseDollarsToCents(price);
  return (
    <Modal title="Custom Item" onClose={onClose}>
      <label className="mb-2 block text-pos-sm font-bold text-slate-600">Description</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-4 w-full rounded-xl border-2 border-slate-300 p-4 text-pos-base"
        placeholder="e.g. Catering tray"
      />
      <label className="mb-2 block text-pos-sm font-bold text-slate-600">Price</label>
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        inputMode="decimal"
        className="mb-6 w-full rounded-xl border-2 border-slate-300 p-4 text-pos-base"
        placeholder="0.00"
      />
      <button
        disabled={!name || cents <= 0}
        onClick={() => onAdd(name, cents)}
        className="w-full rounded-xl bg-brand py-4 text-pos-lg font-extrabold text-white disabled:opacity-30"
      >
        Add {cents > 0 ? dollars(cents) : ""}
      </button>
    </Modal>
  );
}

function CashModal(
  { totalCents, onConfirm, onClose }: {
    totalCents: number;
    onConfirm: (tenderedCents: number) => void;
    onClose: () => void;
  },
) {
  const [tendered, setTendered] = useState("");
  const tenderedCents = parseDollarsToCents(tendered);
  const change = tenderedCents - totalCents;
  // Common bills a cafe customer hands over.
  const quickAmounts = [totalCents, 1000, 2000, 2500, 5000, 10000];

  return (
    <Modal title="Cash Payment" onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-pos-base text-slate-600">Total Due</span>
        <span className="text-pos-xl font-extrabold">{dollars(totalCents)}</span>
      </div>
      <label className="mb-2 block text-pos-sm font-bold text-slate-600">Amount Tendered</label>
      <input
        autoFocus
        value={tendered}
        onChange={(e) => setTendered(e.target.value)}
        inputMode="decimal"
        className="mb-3 w-full rounded-xl border-2 border-slate-300 p-4 text-pos-xl font-bold"
        placeholder="0.00"
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {quickAmounts.map((amt, i) => (
          <button
            key={i}
            onClick={() => setTendered((amt / 100).toFixed(2))}
            className="rounded-lg bg-slate-200 px-4 py-2 text-pos-sm font-bold hover:bg-slate-300"
          >
            {i === 0 ? "Exact" : dollars(amt)}
          </button>
        ))}
      </div>
      <div className="mb-6 flex items-center justify-between rounded-xl bg-slate-100 p-4">
        <span className="text-pos-base font-bold">Change Due</span>
        <span className={`text-pos-2xl font-extrabold ${change < 0 ? "text-red-500" : "text-emerald-600"}`}>
          {dollars(Math.max(0, change))}
        </span>
      </div>
      <button
        disabled={tenderedCents < totalCents}
        onClick={() => onConfirm(tenderedCents)}
        className="w-full rounded-xl bg-emerald-600 py-4 text-pos-lg font-extrabold text-white disabled:opacity-30"
      >
        Complete Sale
      </button>
    </Modal>
  );
}

function CardModal(
  { totalCents, onConfirm, onClose }: {
    totalCents: number;
    onConfirm: () => void;
    onClose: () => void;
  },
) {
  return (
    <Modal title="Card Payment" onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-pos-base text-slate-600">Total</span>
        <span className="text-pos-xl font-extrabold">{dollars(totalCents)}</span>
      </div>
      <p className="mb-6 rounded-xl bg-amber-100 p-4 text-pos-base font-bold text-amber-900">
        Run this card on the card terminal, then tap Complete once it approves.
      </p>
      <button
        onClick={onConfirm}
        className="w-full rounded-xl bg-sky-600 py-4 text-pos-lg font-extrabold text-white"
      >
        Complete Sale
      </button>
    </Modal>
  );
}

function ReceiptModal({ sale, onClose }: { sale: SaleWithLines; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function print() {
    setBusy(true);
    setErr("");
    try {
      const html = await api.receiptHtml(sale.id);
      if (window.pos?.printReceipt) {
        const res = await window.pos.printReceipt(html);
        if (res && res.ok === false && res.error) setErr(res.error);
      } else {
        window.print();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePdf() {
    setBusy(true);
    setErr("");
    try {
      const html = await api.receiptHtml(sale.id);
      if (window.pos?.saveReceiptPdf) {
        const res = await window.pos.saveReceiptPdf(html, `receipt-${sale.id}.pdf`);
        if (res && res.ok === false && res.error) setErr(res.error);
      } else {
        setErr("PDF saving is only available in the desktop app.");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Order #${sale.id} Complete`} onClose={onClose}>
      <div className="mb-4 text-center">
        <div className="text-pos-base text-slate-600">Total Paid ({sale.payment_type})</div>
        <div className="text-pos-2xl font-extrabold text-emerald-600">{dollars(sale.total_cents)}</div>
        {sale.payment_type === "cash" && sale.change_cents != null && (
          <div className="mt-1 text-pos-base">Change: <b>{dollars(sale.change_cents)}</b></div>
        )}
      </div>
      {err && (
        <p className="mb-3 rounded-lg bg-red-100 p-3 text-pos-sm font-bold text-red-700">{err}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={busy}
          onClick={print}
          className="rounded-xl bg-brand py-4 text-pos-base font-extrabold text-white disabled:opacity-40"
        >
          Print Receipt
        </button>
        <button
          disabled={busy}
          onClick={savePdf}
          className="rounded-xl bg-slate-700 py-4 text-pos-base font-extrabold text-white disabled:opacity-40"
        >
          Save PDF
        </button>
      </div>
      <button
        onClick={onClose}
        className="mt-3 w-full rounded-xl bg-emerald-600 py-4 text-pos-lg font-extrabold text-white"
      >
        Next Customer
      </button>
    </Modal>
  );
}
