import { useEffect, useState } from "react";
import { api } from "../api";
import type { Settings } from "../types";

// Cafe info (printed on receipts) and the sales-tax rate. The tax rate is stored
// as a fraction (0.08625) but edited here as a percent (8.625) for clarity.
export function SettingsPage({ onSaved }: { onSaved?: (settings: Settings) => void }) {
  const [settings, setSettings] = useState<Settings>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSettings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  function set(key: string, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setError("");
    try {
      const result = await api.updateSettings(settings);
      setSettings(result);
      setSaved(true);
      onSaved?.(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const percent = ((Number(settings.tax_rate ?? "0") || 0) * 100).toString();

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-6">
      <h2 className="mb-6 text-pos-lg font-bold">Settings</h2>

      <Field label="Cafe Name">
        <input
          value={settings.shop_name ?? ""}
          onChange={(e) => set("shop_name", e.target.value)}
          className="w-full rounded-xl border-2 border-slate-600 bg-slate-800 p-4 text-pos-base text-white"
        />
      </Field>

      <Field label="Address">
        <input
          value={settings.shop_address ?? ""}
          onChange={(e) => set("shop_address", e.target.value)}
          className="w-full rounded-xl border-2 border-slate-600 bg-slate-800 p-4 text-pos-base text-white"
        />
      </Field>

      <Field label="Phone">
        <input
          value={settings.shop_phone ?? ""}
          onChange={(e) => set("shop_phone", e.target.value)}
          className="w-full rounded-xl border-2 border-slate-600 bg-slate-800 p-4 text-pos-base text-white"
        />
      </Field>

      <Field label="Sales Tax Rate (%)">
        <input
          value={percent}
          inputMode="decimal"
          onChange={(e) => {
            const pct = Number(e.target.value.replace(/[^0-9.]/g, ""));
            set("tax_rate", String(Number.isFinite(pct) ? pct / 100 : 0));
          }}
          className="w-full rounded-xl border-2 border-slate-600 bg-slate-800 p-4 text-pos-base text-white"
        />
        <p className="mt-1 text-pos-sm text-slate-400">
          Oklahoma City combined rate is typically 8.625%. Verify the current rate.
        </p>
      </Field>

      {error && <p className="mb-3 text-pos-sm font-bold text-red-400">{error}</p>}

      <button
        onClick={save}
        className="mt-2 rounded-xl bg-brand px-8 py-4 text-pos-lg font-extrabold text-white hover:bg-brand-light"
      >
        Save Settings
      </button>
      {saved && <span className="ml-4 text-pos-base font-bold text-emerald-400">Saved ✓</span>}

      <div className="mt-10 border-t border-slate-800 pt-4 text-pos-sm text-slate-500">
        Bee Healthy Cafe POS · version {__APP_VERSION__}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-pos-sm font-bold text-slate-400">{label}</label>
      {children}
    </div>
  );
}
