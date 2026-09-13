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
  html, body { margin: 0; padding: 0; background: #f1f5f9; color: #172033; font: 13px Arial, sans-serif; }
  .invoice-container { max-width: 210mm; margin: 30px auto; background: #fff; padding: 20mm; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; border-radius: 8px; }
  .top { display: flex; justify-content: space-between; border-bottom: 3px solid #0f766e; padding-bottom: 14px; }
  h1 { margin: 0; color: #0f766e; font-size: 28px; letter-spacing: .04em; font-weight: 800; }
  h2 { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #0f766e; }
  .muted { color: #64748b; font-size: 11px; }
  .meta { text-align: right; line-height: 1.6; }
  .customer { margin: 24px 0 18px; display: flex; justify-content: space-between; gap: 20px; }
  .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; }
  th { background: #e6fffb; color: #115e59; font-size: 11px; text-align: left; text-transform: uppercase; font-weight: bold; }
  th, td { border-bottom: 1px solid #cbd5e1; padding: 12px 10px; vertical-align: top; }
  .right { text-align: right; white-space: nowrap; }
  .summary { width: 320px; margin: 25px 0 0 auto; }
  .summary div { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .summary .total { border-top: 2px solid #0f766e; font-size: 16px; font-weight: 700; padding-top: 10px; margin-top: 4px; }
  .summary .balance { color: #b45309; font-weight: 700; font-size: 14px; border-top: 1px dotted #cbd5e1; padding-top: 8px; margin-top: 4px; }
  .footer { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px; align-items: flex-end; }
  .signature { min-width: 220px; padding-top: 50px; border-top: 1px solid #94a3b8; text-align: center; font-weight: bold; }
  .reprint { color: #b91c1c; font-weight: 700; border: 1px solid #fecaca; padding: 5px 10px; display: inline-block; margin-top: 8px; border-radius: 4px; background: #fff5f5; font-size: 11px; text-transform: uppercase; }
  @media print {
    body { background: #fff; }
    .invoice-container { max-width: none; margin: 0; padding: 0; box-shadow: none; border: none; border-radius: 0; }
    .no-print { display: none; }
  }
</style></head><body>
  <div class="invoice-container">
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
  </div>
</body></html>`;
}