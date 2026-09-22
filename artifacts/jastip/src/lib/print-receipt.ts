import jsPDF from "jspdf";

export type ReceiptPrintPayload = {
  business: { name: string; subtitle: string };
  transaction: {
    transactionNo: string;
    customerName: string;
    subtotal: number;
    additionalFee?: number;
    additionalFeeReason?: string | null;
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
    ${row("Subtotal Ongkir", formatRp(transaction.subtotal))}
    ${(transaction.additionalFee ?? 0) > 0 ? row(`Biaya Tambahan${transaction.additionalFeeReason ? ` (${transaction.additionalFeeReason})` : ""}`, formatRp(transaction.additionalFee)) : ""}
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

export function downloadReceiptPdf(
  receipt: ReceiptPrintPayload,
  print?: { isReprint?: boolean; copyNumber?: number },
) {
  const transaction = receipt.transaction;
  const pkgCount = receipt.packages.length;
  const payCount = receipt.payments.length;
  
  // Calculate dynamic height for 80mm thermal receipt
  const estimatedHeight = Math.max(150, 120 + pkgCount * 12 + payCount * 10);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, estimatedHeight],
  });

  const pageWidth = 80;
  const margin = 5;
  const printWidth = pageWidth - margin * 2;
  let y = 8;

  function drawDashedLine(currentY: number) {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    doc.setLineDashPattern([], 0); // reset
  }

  function drawRow(label: string, value: string, bold = false, fontSize = 7.5) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 41, 59);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += 4.5;
  }

  // Header Brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(receipt.business?.name || "JASTIP ANGGUN JAYA", 40, y, { align: "center" });
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(receipt.business?.subtitle || "Ekspedisi Jawa — Manokwari, Papua Barat", 40, y, { align: "center" });
  y += 4;

  if (print?.isReprint) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(185, 28, 28);
    doc.text(`[ SALINAN / REPRINT #${print.copyNumber || 1} ]`, 40, y, { align: "center" });
    y += 4.5;
  }

  y += 1;
  drawDashedLine(y);
  y += 4.5;

  // Transaction Meta
  drawRow("No. Transaksi:", transaction.transactionNo, false, 7);
  drawRow("Waktu:", `${formatDate(transaction.createdAt)} WIT`, false, 7);
  drawRow("Customer:", transaction.customerName, true, 7.5);
  drawRow("Kasir:", receipt.cashier?.name || "-", false, 7);
  drawRow("Shift:", receipt.shift ? `${receipt.shift.shiftType} #${receipt.shift.id}` : "-", false, 7);

  y += 1;
  drawDashedLine(y);
  y += 4.5;

  // Package Details Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`RINCIAN PAKET (${pkgCount})`, margin, y);
  y += 4.5;

  if (receipt.packages.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Tidak ada rincian paket.", margin, y);
    y += 4;
  } else {
    receipt.packages.forEach((pkg) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const itemName = pkg.itemName || "Paket";
      doc.text(itemName.length > 25 ? itemName.substring(0, 23) + "..." : itemName, margin, y);
      doc.text(formatRp(pkg.totalShipping), pageWidth - margin, y, { align: "right" });
      y += 3.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      const resiText = `${pkg.resiNumber || "-"}${pkg.packageNumber ? ` · #${pkg.packageNumber}` : ""}`;
      doc.text(resiText, margin, y);
      y += 3.2;

      const svcText = `${pkg.serviceType || "Layanan"} · ${Number(pkg.usedWeight || 0).toFixed(2)} kg`;
      doc.text(svcText, margin, y);
      y += 4.2;
    });
  }

  drawDashedLine(y);
  y += 4.5;

  // Financial Breakdown
  drawRow("Subtotal Ongkir:", formatRp(transaction.subtotal), false, 7.5);

  if ((transaction.additionalFee ?? 0) > 0) {
    const feeLabel = `Biaya Tambahan${transaction.additionalFeeReason ? ` (${transaction.additionalFeeReason})` : ""}:`;
    drawRow(feeLabel.length > 22 ? feeLabel.substring(0, 20) + "..:" : feeLabel, formatRp(transaction.additionalFee), false, 7);
  }

  if (transaction.discount > 0) {
    const discLabel = `Diskon${transaction.discountReason ? ` (${transaction.discountReason})` : ""}:`;
    drawRow(discLabel.length > 22 ? discLabel.substring(0, 20) + "..:" : discLabel, `-${formatRp(transaction.discount)}`, false, 7);
  }

  // Total
  y += 1;
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y - 3, printWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 118, 110);
  doc.text("TOTAL:", margin + 2, y + 2.5);
  doc.text(formatRp(transaction.total), pageWidth - margin - 2, y + 2.5, { align: "right" });
  y += 9;

  // Payments
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text("PEMBAYARAN", margin, y);
  y += 4.5;

  const validPayments = receipt.payments.filter((p) => p.totalAmount !== 0 || p.paidAmount !== 0);
  if (validPayments.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Belum ada pembayaran.", margin, y);
    y += 4;
  } else {
    validPayments.forEach((p) => {
      drawRow(p.paymentMethodLabel || p.paymentTypeLabel || "Bayar", formatRp(p.totalAmount), true, 7.5);
      if (p.paymentMethod === "tunai" && p.changeAmount > 0) {
        drawRow("Kembalian:", formatRp(p.changeAmount), false, 7);
      }
      if (p.paymentReference) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Ref: ${p.paymentReference}`, margin, y);
        y += 3.5;
      }
    });
  }

  if (transaction.sisaPiutang > 0) {
    y += 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    doc.text("Sisa Piutang:", margin, y);
    doc.text(formatRp(transaction.sisaPiutang), pageWidth - margin, y, { align: "right" });
    y += 4.5;
  }

  y += 1;
  drawDashedLine(y);
  y += 4.5;

  // Status Info
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y - 2.5, printWidth, 9, 1, 1, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Status Bayar: ${transaction.paymentStatus}`, margin + 2, y + 1);
  doc.text(`Status Transaksi: ${transaction.transactionStatus}`, margin + 2, y + 4.5);
  y += 11;

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Terima kasih telah menggunakan layanan kami.", 40, y, { align: "center" });
  y += 3.5;
  doc.text("Struk ini adalah bukti pembayaran yang sah.", 40, y, { align: "center" });

  const cleanTrxNo = (transaction.transactionNo || "TRX").replace(/[^a-zA-Z0-9-_]/g, "_");
  doc.save(`Struk-${cleanTrxNo}.pdf`);
}
