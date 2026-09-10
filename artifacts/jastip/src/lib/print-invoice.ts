type InvoiceItem = {
  description: string;
  qty: number;
  weight?: string | number | null;
  unitPrice: string | number;
  lineTotal: string | number;
};

export type InvoicePrintPayload = {
  invoiceNo: string;
  customerSnapshot: { customerName?: string; transactionNo?: string };
  issuedAt: string;
  dueAt?: string | null;
  subtotal: string | number;
  discount: string | number;
  downPayment: string | number;
  total: string | number;
  balance: string | number;
  status: string;
  items: InvoiceItem[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRp(value: unknown) {
  return `Rp${Math.round(Number(value ?? 0)).toLocaleString("id-ID")}`;
}

export function buildInvoiceDocument(invoice: InvoicePrintPayload, print?: { label?: string | null }) {
  const snapshot = invoice.customerSnapshot || {};
  const rows = invoice.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td class="right">${item.qty}</td>
      <td class="right">${item.weight ? `${escapeHtml(item.weight)} kg` : "-"}</td>
      <td class="right">${formatRp(item.unitPrice)}</td>
      <td class="right">${formatRp(item.lineTotal)}</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNo)} — Invoice</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font: 12px Arial, sans-serif; }
  .top { display: flex; justify-content: space-between; border-bottom: 3px solid #0f766e; padding-bottom: 14px; }
  h1 { margin: 0; color: #0f766e; font-size: 25px; letter-spacing: .04em; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  .muted { color: #64748b; }
  .meta { text-align: right; line-height: 1.6; }
  .customer { margin: 24px 0 18px; display: flex; justify-content: space-between; }
  .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #e6fffb; color: #115e59; font-size: 10px; text-align: left; text-transform: uppercase; }
  th, td { border-bottom: 1px solid #cbd5e1; padding: 9px 7px; vertical-align: top; }
  .right { text-align: right; white-space: nowrap; }
  .summary { width: 280px; margin: 20px 0 0 auto; }
  .summary div { display: flex; justify-content: space-between; padding: 5px 0; }
  .summary .total { border-top: 2px solid #0f766e; font-size: 15px; font-weight: 700; padding-top: 9px; }
  .summary .balance { color: #b45309; font-weight: 700; }
  .footer { margin-top: 46px; display: flex; justify-content: space-between; gap: 40px; }
  .signature { min-width: 190px; padding-top: 42px; border-top: 1px solid #94a3b8; text-align: center; }
  .reprint { color: #b91c1c; font-weight: 700; border: 1px solid #fecaca; padding: 5px 8px; display: inline-block; margin-top: 8px; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <div class="top">
    <div><h2>JASTIP ANGGUN JAYA</h2><div class="muted">Ekspedisi Jawa — Manokwari, Papua Barat</div></div>
    <div class="meta"><h1>INVOICE</h1><strong>${escapeHtml(invoice.invoiceNo)}</strong><br>Terbit: ${new Date(invoice.issuedAt).toLocaleDateString("id-ID")}<br>${invoice.dueAt ? `Jatuh tempo: ${new Date(invoice.dueAt).toLocaleDateString("id-ID")}` : "Jatuh tempo: -"}${print?.label ? `<div class="reprint">${escapeHtml(print.label)}</div>` : ""}</div>
  </div>
  <div class="customer">
    <div><div class="label">Ditagihkan kepada</div><strong>${escapeHtml(snapshot.customerName || "Pelanggan umum")}</strong>${snapshot.transactionNo ? `<div class="muted">Transaksi ${escapeHtml(snapshot.transactionNo)}</div>` : ""}</div>
    <div><div class="label">Status</div><strong>${escapeHtml(invoice.status)}</strong></div>
  </div>
  <table><thead><tr><th>#</th><th>Rincian kiriman</th><th class="right">Qty</th><th class="right">Berat</th><th class="right">Harga</th><th class="right">Jumlah</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="summary">
    <div><span>Subtotal</span><strong>${formatRp(invoice.subtotal)}</strong></div>
    <div><span>Diskon</span><strong>-${formatRp(invoice.discount)}</strong></div>
    <div class="total"><span>Total</span><span>${formatRp(invoice.total)}</span></div>
    <div><span>DP / terbayar</span><strong>${formatRp(invoice.downPayment)}</strong></div>
    <div class="balance"><span>Sisa</span><span>${formatRp(invoice.balance)}</span></div>
  </div>
  <div class="footer"><div class="muted">Invoice ini dibuat dari snapshot data saat diterbitkan.<br>Perubahan tarif atau data paket setelah penerbitan tidak mengubah invoice ini.</div><div class="signature">Owner / Penanggung Jawab</div></div>
</body></html>`;
}