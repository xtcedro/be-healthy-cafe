// Renders a sale as a clean, printable HTML receipt. The renderer hands this HTML
// to Electron, which prints it via the OS print dialog or saves it as a PDF — no
// receipt-printer hardware required.

import type { SaleWithLines } from "./db.ts";

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderReceiptHtml(
  sale: SaleWithLines,
  shop: { shop_name?: string; shop_address?: string; shop_phone?: string },
): string {
  const when = new Date(sale.created_at).toLocaleString("en-US");
  const lines = sale.lines
    .map(
      (l) => `
      <tr>
        <td class="qty">${l.qty}&times;</td>
        <td class="name">${escapeHtml(l.name)}</td>
        <td class="amt">${dollars(l.line_total_cents)}</td>
      </tr>`,
    )
    .join("");

  const paymentLabel = sale.payment_type === "cash" ? "Cash" : "Card";
  const cashRows = sale.payment_type === "cash"
    ? `
      <tr><td colspan="2">Tendered</td><td class="amt">${
      dollars(sale.cash_tendered_cents ?? 0)
    }</td></tr>
      <tr><td colspan="2">Change</td><td class="amt">${
      dollars(sale.change_cents ?? 0)
    }</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt #${sale.id}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Courier New", monospace; color: #000; margin: 0; padding: 12px;
         width: 300px; font-size: 13px; }
  .center { text-align: center; }
  .shop-name { font-size: 18px; font-weight: bold; }
  .muted { color: #333; font-size: 12px; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  td.qty { width: 28px; }
  td.amt { text-align: right; white-space: nowrap; }
  .totals td { padding: 2px 0; }
  .grand td { font-weight: bold; font-size: 15px; border-top: 1px solid #000; padding-top: 4px; }
  .thanks { margin-top: 10px; text-align: center; }
  @media print { body { width: auto; } }
</style>
</head>
<body>
  <div class="center">
    <div class="shop-name">${escapeHtml(shop.shop_name ?? "Bee Healthy Cafe")}</div>
    ${shop.shop_address ? `<div class="muted">${escapeHtml(shop.shop_address)}</div>` : ""}
    ${shop.shop_phone ? `<div class="muted">${escapeHtml(shop.shop_phone)}</div>` : ""}
  </div>
  <hr />
  <div class="muted">Receipt #${sale.id}</div>
  <div class="muted">${when}</div>
  <hr />
  <table>${lines}</table>
  <hr />
  <table class="totals">
    <tr><td colspan="2">Subtotal</td><td class="amt">${dollars(sale.subtotal_cents)}</td></tr>
    <tr><td colspan="2">Tax</td><td class="amt">${dollars(sale.tax_cents)}</td></tr>
    <tr class="grand"><td colspan="2">TOTAL</td><td class="amt">${dollars(sale.total_cents)}</td></tr>
    <tr><td colspan="2">Paid (${paymentLabel})</td><td class="amt">${dollars(sale.total_cents)}</td></tr>
    ${cashRows}
  </table>
  <div class="thanks">Thank you — stay healthy! 🐝</div>
</body>
</html>`;
}
