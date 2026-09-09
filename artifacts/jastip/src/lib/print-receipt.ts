export type ReceiptPrintPayload = {
  business: { name: string; subtitle: string };
  transaction: {
    transactionNo: string;
    customerName: string;
    subtotal: number;
    discount: number;
    discountReason?: string | null;
    total: number;
    paymentStatus: string;
    transactionStatus: string;
    sisaPiutang: number;
    createdAt: string;
  };
  payments: Array<{
    paymentTypeLabel: string;
    paymentMethod?: string | null;
    paymentMethodLabel: string;
    totalAmount: number;
    paidAmount: number;
    changeAmount: number;
    paymentReference?: string | null;
    createdAt: string;
  }>;
  packages: Array<{
    resiNumber: string;
    packageNumber?: string | null;
    itemName?: string | null;
    serviceType?: string | null;
    usedWeight: number;
    totalShipping: number;
  }>;
  cashier?: { name: string } | null;
  shift?: { id: number; shiftType: string; terminalId?: string | null } | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRp(value: unknown) {
  return `Rp ${Math.round(Number(value ?? 0)).toLocaleString("id-ID")}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jayapura",
  });
}

function row(label: string, value: string, emphasis = false) {
  return `<div class="row${emphasis ? " emphasis" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export function buildReceiptDocument(
  receipt: ReceiptPrintPayload,
  print: { isReprint: boolean; copyNumber: number },
) {
  const transaction = receipt.transaction;
  const packageRows = receipt.packages
    .map(
      (pkg) => `
        <div class="package">
          <div class="package-main">
            <strong>${escapeHtml(pkg.itemName || "Paket")}</strong>
            <span>${escapeHtml(pkg.resiNumber || "-")}${pkg.packageNumber ? ` · #${escapeHtml(pkg.packageNumber)}` : ""}</span>
          </div>
          <div class="package-meta">
            <span>${escapeHtml(pkg.serviceType || "Layanan")} · ${Number(pkg.usedWeight || 0).toFixed(2)} kg</span>
            <strong>${formatRp(pkg.totalShipping)}</strong>
          </div>
        </div>`,
    )
    .join("");

  const paymentRows = receipt.payments
    .filter((payment) => payment.totalAmount !== 0 || payment.paidAmount !== 0)
    .map(
      (payment) => `
        <div class="row">
          <span>${escapeHtml(payment.paymentMethodLabel || payment.paymentTypeLabel)}</span>
          <strong>${formatRp(payment.totalAmount)}</strong>
        </div>
        ${payment.paymentMethod === "tunai" && payment.changeAmount > 0 ? row("Kembalian", formatRp(payment.changeAmount)) : ""}
        ${payment.paymentReference ? `<div class="note">Ref: ${escapeHtml(payment.paymentReference)}</div>` : ""}`,
    )
    .join("");

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(transaction.transactionNo)} — Struk</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { width: 80mm; color: #111; font: 12px/1.35 Arial, sans-serif; padding: 5mm 4mm 7mm; }
      .center { text-align: center; }
      .business { font-size: 17px; font-weight: 800; letter-spacing: .3px; }
      .subtitle { color: #555; font-size: 10px; margin-top: 2px; }
      .reprint { display: inline-block; border: 1px solid #111; padding: 2px 6px; margin: 7px 0 2px; font-size: 10px; font-weight: 700; }
      .rule { border-top: 1px dashed #777; margin: 9px 0; }
      .meta { color: #333; font-size: 10px; }
      .meta div { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
      .section-title { font-weight: 800; margin: 8px 0 4px; text-transform: uppercase; font-size: 10px; letter-spacing: .4px; }
      .package { border-bottom: 1px dotted #aaa; padding: 4px 0; }
      .package-main, .package-meta { display: flex; justify-content: space-between; gap: 8px; }
      .package-main span, .package-meta { color: #444; font-size: 10px; }
      .package-main strong { max-width: 42mm; overflow-wrap: anywhere; }
      .package-meta { margin-top: 2px; }
      .row { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
      .row strong { text-align: right; }
      .emphasis { font-size: 15px; margin-top: 7px; }
      .note { color: #555; font-size: 10px; margin: -1px 0 4px; }
      .status { background: #f2f2f2; border-radius: 3px; padding: 5px 6px; margin-top: 8px; font-size: 10px; }
      .footer { color: #555; font-size: 10px; margin-top: 12px; }
      @media screen { body { margin: 10px auto; box-shadow: 0 0 0 1px #ddd; } }
    </style>
  </head>
  <body>
    <div class="center">
      <div class="business">${escapeHtml(receipt.business.name)}</div>
      <div class="subtitle">${escapeHtml(receipt.business.subtitle)}</div>
      ${print.isReprint ? `<div class="reprint">SALINAN / REPRINT #${print.copyNumber}</div>` : ""}
    </div>
    <div class="rule"></div>
    <div class="meta">
      <div><span>No. transaksi</span><strong>${escapeHtml(transaction.transactionNo)}</strong></div>
      <div><span>Waktu</span><strong>${escapeHtml(formatDate(transaction.createdAt))} WIT</strong></div>
      <div><span>Customer</span><strong>${escapeHtml(transaction.customerName)}</strong></div>
      <div><span>Kasir</span><strong>${escapeHtml(receipt.cashier?.name || "-")}</strong></div>
      <div><span>Shift</span><strong>${receipt.shift ? `${escapeHtml(receipt.shift.shiftType)} #${receipt.shift.id}` : "-"}</strong></div>
    </div>
    <div class="rule"></div>
    <div class="section-title">Rincian paket (${receipt.packages.length})</div>
    ${packageRows || `<div class="note">Rincian paket tidak tersedia.</div>`}
    <div class="rule"></div>
    ${row("Subtotal", formatRp(transaction.subtotal))}
    ${transaction.discount > 0 ? row(`Diskon${transaction.discountReason ? ` (${transaction.discountReason})` : ""}`, `- ${formatRp(transaction.discount)}`) : ""}
    ${row("TOTAL", formatRp(transaction.total), true)}
    <div class="section-title">Pembayaran</div>
    ${paymentRows || `<div class="note">Belum ada pembayaran.</div>`}
    ${transaction.sisaPiutang > 0 ? row("Sisa piutang", formatRp(transaction.sisaPiutang)) : ""}
    <div class="status">
      Status pembayaran: <strong>${escapeHtml(transaction.paymentStatus)}</strong><br />
      Status transaksi: <strong>${escapeHtml(transaction.transactionStatus)}</strong>
    </div>
    <div class="footer center">
      Terima kasih telah menggunakan layanan kami.<br />
      Struk ini adalah bukti pembayaran yang sah.
    </div>
    <script>window.addEventListener("load", () => setTimeout(() => window.print(), 150));</script>
  </body>
</html>`;
}