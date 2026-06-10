# Bee Healthy Cafe POS

A **local-first** point-of-sale register for **Bee Healthy Cafe** (Oklahoma City, OK).
It runs fully offline on a Windows PC at the counter and is designed for
non-technical staff: large buttons, big totals, and a single checkout screen.

It shares its core engine with the Rivera Tire POS — the same proven Electron +
Deno + SQLite stack — re-skinned and re-seeded for a healthy smoothie & cafe menu.

## What it does

- **Register** — tap menu items (or add a custom one), set quantities, take **Cash**
  (with change-due math) or **Card** (run on your separate terminal), and print/save a
  receipt. Use the **category filter tabs** (Smoothies, Bowls, Coffee, …) to narrow a
  long menu.
- **Dashboard** — owner command center with a Today / 7-day / 30-day toggle: animated
  KPI cards (revenue, orders, avg ticket, items sold) with vs-prior-period deltas, a
  revenue sparkline, a cash-vs-card mix bar, and a recent-orders list with reprint.
- **Items** — manage the quick-tap menu: name, **category** (preset or custom), price,
  **button color**, an optional **description/note** (e.g. ingredients), and an
  **Available** toggle to hide/show an item without deleting it. Items can be **hidden**
  (kept for later) or **permanently deleted** — past orders are never affected.
- **Settings** — cafe info printed on receipts and the sales-tax rate.

> Card payments are **recorded only** — the card is charged on your existing standalone
> terminal. No card data is processed or stored by this app (no PCI scope).

## Menu (fresh-install seed)

A starter menu ships on first launch and is fully editable in the **Items** screen:

| Category | Examples |
|----------|----------|
| Smoothies | Strawberry Banana, Green Machine, Peanut Butter Power |
| Acai Bowls | Classic Acai Bowl, PB Acai Bowl, Build-Your-Own |
| Coffee | Drip, Latte, Cappuccino, Chai Latte, Matcha Latte, Cold Brew |
| Breakfast | Avocado Toast, Breakfast Burrito, Yogurt Parfait |
| Wraps | California, Baja, Buffalo Chicken, Black Bean |
| Bowls | Pick Your Protein, Sesame Thai, Greek, Chipotle |
| Salads | Greek, Cobb, Garden |
| Sides | Chips & Salsa, Hummus & Chips, Soup, Chili |
| Add-ons | Protein Boost, Extra Avocado, Almond Milk, Espresso Shot |

Prices are starter values — set the real ones in **Items**.

## Architecture

| Layer | Tech | Notes |
|-------|------|-------|
| App shell | **Electron** | Window + spawns the backend, handles printing |
| Backend | **Deno + Hono** | Localhost-only HTTP API, run as a sidecar process |
| Data | **SQLite** (`node:sqlite`) | Single file in your user data folder — local-first |
| UI | **Vite + React + Tailwind** | Big-button touchscreen-friendly interface |

The backend binds only to `127.0.0.1` and is never exposed to the network. Money is
stored as integer cents; order totals are always recomputed on the backend from the
configured tax rate (the UI's numbers are never trusted).

**Data location:** `%APPDATA%/Bee Healthy Cafe POS/bee-pos.db` (Windows).

**Automatic backups:** on each launch the app writes a consistent daily snapshot to
`%APPDATA%/Bee Healthy Cafe POS/backups/bee-pos-YYYY-MM-DD.db` and keeps the most
recent 14. These live on the same PC, so for real protection **copy the `backups/`
folder to a USB drive or network share periodically** — that's the only safeguard
against a drive failure.

## Prerequisites (development)

- **Deno** 2.x (backend runtime + tests)
- **Node.js** 18+ and **npm** (Electron shell + Vite renderer)

## Develop

```bash
npm install          # install renderer + Electron deps
npm run dev          # Vite renderer + Electron, with the Deno backend as a sidecar
```

`npm run dev` runs the renderer on :5173 and launches Electron, which spawns
`deno run backend/server.ts` on a free localhost port.

## Test the backend

```bash
deno task test
```

## Build a Windows installer

```bash
deno task build:backend   # compile the Deno backend → dist/bee-backend.exe
npm run dist              # build renderer + Electron and package an NSIS installer
```

The installer bundles the compiled backend exe, so the cafe PC needs no Deno or Node.

## Notes

- This app is named after **Bee Healthy Cafe**, the Oklahoma City healthy-food chain
  (smoothies, bowls, wraps, salads). The seed menu is a representative starter set —
  confirm the live menu and prices before going live.
- Out of scope for this release (designed to add later): online ordering, loyalty,
  inventory tracking, integrated card processing.
