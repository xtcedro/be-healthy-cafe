import { useEffect, useState } from "react";
import { api } from "./api";
import { Register } from "./pages/Register";
import { Catalog } from "./pages/Catalog";
import { Dashboard } from "./pages/Dashboard";
import { SettingsPage } from "./pages/Settings";

type Tab = "register" | "dashboard" | "catalog" | "settings";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "register", label: "Register" },
  { id: "dashboard", label: "Dashboard" },
  { id: "catalog", label: "Items" },
  { id: "settings", label: "Settings" },
];

const DEFAULT_SHOP_NAME = "Bee Healthy Cafe";

export function App() {
  const [tab, setTab] = useState<Tab>("register");
  // Shop name shown in the header — sourced from Settings and updated live on save.
  const [shopName, setShopName] = useState(DEFAULT_SHOP_NAME);

  useEffect(() => {
    api.getSettings()
      .then((s) => setShopName(s.shop_name?.trim() || DEFAULT_SHOP_NAME))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between bg-brand-dark px-6 py-3 shadow-lg">
        <div className="flex items-baseline gap-3">
          <span className="text-pos-lg font-extrabold tracking-tight">🐝 {shopName}</span>
          <span className="text-pos-sm text-honey-light">Point of Sale</span>
          <span className="rounded-md bg-black/20 px-2 py-0.5 text-xs font-semibold tracking-wide text-honey-light/80">
            v{__APP_VERSION__}
          </span>
        </div>
        <nav className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-5 py-3 text-pos-sm font-bold transition ${
                tab === t.id
                  ? "bg-white text-brand-dark"
                  : "bg-brand text-white hover:bg-brand-light"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "register" && <Register />}
        {tab === "dashboard" && <Dashboard />}
        {tab === "catalog" && <Catalog />}
        {tab === "settings" && (
          <SettingsPage
            onSaved={(s) => setShopName(s.shop_name?.trim() || DEFAULT_SHOP_NAME)}
          />
        )}
      </main>
    </div>
  );
}
