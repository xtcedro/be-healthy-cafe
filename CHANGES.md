# Changelog

All notable changes to the Bee Healthy Cafe POS are recorded here.

## [0.1.0] - 2026-06-08

Initial release — a local-first checkout register for Bee Healthy Cafe (Oklahoma
City), built on the same core engine as the Rivera Tire POS and customized for a
healthy smoothie & cafe menu.

### Added
- **Electron** app shell that spawns the **Deno** backend as a localhost sidecar,
  waits for `/health`, and handles receipt printing / save-to-PDF.
- **Deno + Hono** backend bound to `127.0.0.1`, storing data in a single **SQLite**
  file (`bee-pos.db`, via `node:sqlite`) — fully offline / local-first.
- **Register** checkout screen with big touch buttons: quick-tap menu items, custom
  line items, quantity controls, live subtotal/tax/total, and category filter tabs.
- **Cash** payment with amount-tendered and change-due calculation; **Card** payment
  recorded only (charged on a separate terminal — no PCI scope).
- **Owner Dashboard** with Today / 7-day / 30-day ranges: animated KPI cards
  (Revenue, Orders, Avg Ticket, Items Sold) with period-over-period deltas, a revenue
  sparkline, a cash-vs-card payment-mix bar, and a recent-orders list with one-tap
  receipt reprint.
- **Items** management (add/edit/hide/permanent-delete) with preset cafe categories
  (Smoothies, Acai Bowls, Coffee, Breakfast, Wraps, Bowls, Salads, Sides, Add-ons),
  button colors, and optional ingredient notes.
- **Settings** for cafe info (printed on receipts) and a configurable sales-tax rate,
  defaulting to Oklahoma City's 8.625% combined rate.
- Printable HTML **receipts** via the OS print dialog and **Save PDF**.
- **Automatic daily backups** of the database to a `backups/` folder (keeps 14).
- Backend unit + HTTP tests (`deno task test`) covering tax math, server-side total
  recomputation, the sales/receipt/dashboard endpoints, and schema migrations.
- electron-builder config to produce a Windows NSIS installer bundling the compiled
  backend exe (`bee-backend.exe`), so the cafe PC needs no Deno/Node.

### Customized from the Rivera Tire POS base
- Re-seeded the catalog with a Bee Healthy Cafe smoothie/bowl/wrap/coffee menu and
  cafe-appropriate categories and button colors.
- Re-skinned the UI: leafy-green brand with a warm honey accent and a 🐝 wordmark;
  "Cart"→"Order", "Sales"→"Orders" wording throughout.
- Renamed the database, backend exe, app id, and product name to the cafe.
- Receipt footer now reads "Thank you — stay healthy! 🐝".

### Notes
- Money is stored as integer cents; order totals are always recomputed server-side.
- The seed menu and prices are a representative starter set — confirm the live menu
  before going live.
