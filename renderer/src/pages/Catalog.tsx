import { useEffect, useState } from "react";
import { api, dollars, parseDollarsToCents } from "../api";
import type { CatalogItem } from "../types";
import { Modal } from "../components/Modal";
import { CATEGORIES, COLORS, DEFAULT_COLOR } from "../catalog-meta";

// Manage the quick-tap items shown on the register. Shows hidden items too, so they
// can be re-shown or permanently deleted.
export function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [editing, setEditing] = useState<CatalogItem | "new" | null>(null);
  const [error, setError] = useState("");

  function reload() {
    api.listCatalog(true).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(reload, []);

  async function toggleActive(item: CatalogItem) {
    await api.updateCatalogItem(item.id, { active: item.active ? 0 : 1 });
    reload();
  }

  async function purge(item: CatalogItem) {
    if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.\n\n(Past sales are not affected.)`)) {
      return;
    }
    await api.purgeCatalogItem(item.id);
    reload();
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-pos-lg font-bold">Menu Items</h2>
        <button
          onClick={() => setEditing("new")}
          className="rounded-xl bg-brand px-6 py-3 text-pos-base font-bold text-white hover:bg-brand-light"
        >
          + Add Item
        </button>
      </div>

      {error && <p className="mb-3 text-pos-sm font-bold text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-xl ring-1 ring-slate-700">
        <table className="w-full">
          <thead className="bg-slate-800 text-left text-pos-sm text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const hidden = !it.active;
              return (
                <tr
                  key={it.id}
                  className={`border-t border-slate-800 text-pos-base ${hidden ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-6 w-6 shrink-0 rounded-md ring-1 ring-black/30"
                        style={{ backgroundColor: it.color ?? DEFAULT_COLOR }}
                      />
                      <div>
                        <div className="font-bold">{it.name}</div>
                        {it.description && (
                          <div className="text-pos-sm text-slate-400">{it.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{it.category}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">{dollars(it.price_cents)}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-3 py-1 text-pos-sm font-bold ${
                        hidden ? "bg-slate-700 text-slate-300" : "bg-emerald-900 text-emerald-200"
                      }`}
                    >
                      {hidden ? "Hidden" : "Available"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(it)}
                      className="mr-2 rounded-lg bg-slate-700 px-4 py-2 text-pos-sm font-bold hover:bg-slate-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(it)}
                      className="mr-2 rounded-lg bg-slate-700 px-4 py-2 text-pos-sm font-bold hover:bg-slate-600"
                    >
                      {hidden ? "Show" : "Hide"}
                    </button>
                    <button
                      onClick={() => purge(it)}
                      className="rounded-lg bg-red-900 px-4 py-2 text-pos-sm font-bold text-red-200 hover:bg-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ItemModal(
  { item, onSaved, onClose }: {
    item: CatalogItem | null;
    onSaved: () => void;
    onClose: () => void;
  },
) {
  const [name, setName] = useState(item?.name ?? "");
  // Treat a category outside the presets as "custom".
  const initialCategory = item?.category ?? CATEGORIES[0];
  const isPreset = (CATEGORIES as readonly string[]).includes(initialCategory);
  const [categoryChoice, setCategoryChoice] = useState(isPreset ? initialCategory : "__custom__");
  const [customCategory, setCustomCategory] = useState(isPreset ? "" : initialCategory);
  const [price, setPrice] = useState(item ? (item.price_cents / 100).toFixed(2) : "");
  const [color, setColor] = useState(item?.color ?? DEFAULT_COLOR);
  const [description, setDescription] = useState(item?.description ?? "");
  const [active, setActive] = useState(item ? !!item.active : true);
  const [busy, setBusy] = useState(false);

  const cents = parseDollarsToCents(price);
  const category = categoryChoice === "__custom__" ? customCategory.trim() : categoryChoice;

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name,
        category: category || "General",
        price_cents: cents,
        color,
        description: description.trim() || null,
      };
      if (item) {
        await api.updateCatalogItem(item.id, { ...payload, active: active ? 1 : 0 });
      } else {
        await api.createCatalogItem(payload);
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={item ? "Edit Item" : "Add Item"} onClose={onClose}>
      <label className="mb-2 block text-pos-sm font-bold text-slate-600">Name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-4 w-full rounded-xl border-2 border-slate-300 p-4 text-pos-base"
      />

      <label className="mb-2 block text-pos-sm font-bold text-slate-600">Category</label>
      <select
        value={categoryChoice}
        onChange={(e) => setCategoryChoice(e.target.value)}
        className="mb-3 w-full rounded-xl border-2 border-slate-300 bg-white p-4 text-pos-base"
      >
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value="__custom__">Custom…</option>
      </select>
      {categoryChoice === "__custom__" && (
        <input
          value={customCategory}
          onChange={(e) => setCustomCategory(e.target.value)}
          placeholder="Custom category name"
          className="mb-4 w-full rounded-xl border-2 border-slate-300 p-4 text-pos-base"
        />
      )}

      <label className="mb-2 block text-pos-sm font-bold text-slate-600">Price</label>
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        inputMode="decimal"
        className="mb-4 w-full rounded-xl border-2 border-slate-300 p-4 text-pos-base"
        placeholder="0.00"
      />

      <label className="mb-2 block text-pos-sm font-bold text-slate-600">Button Color</label>
      <div className="mb-4 flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            onClick={() => setColor(c.hex)}
            className={`h-11 w-11 rounded-lg ring-2 transition ${
              color === c.hex ? "ring-slate-900 scale-110" : "ring-transparent"
            }`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>

      <label className="mb-2 block text-pos-sm font-bold text-slate-600">
        Description / note <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="e.g. Kale, spinach, banana, apple"
        className="mb-4 w-full rounded-xl border-2 border-slate-300 p-4 text-pos-base"
      />

      {item && (
        <label className="mb-6 flex items-center gap-3 text-pos-base font-bold text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-6 w-6"
          />
          Available on register
        </label>
      )}

      <button
        disabled={busy || !name || cents <= 0 || (categoryChoice === "__custom__" && !customCategory.trim())}
        onClick={save}
        className="w-full rounded-xl bg-brand py-4 text-pos-lg font-extrabold text-white disabled:opacity-30"
      >
        Save
      </button>
    </Modal>
  );
}
