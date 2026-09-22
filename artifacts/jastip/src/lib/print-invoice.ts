import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

export function downloadInvoicePdf(invoice: InvoicePrintPayload, print?: { label?: string | null }) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const snapshot = invoice.customerSnapshot || {};

  // Header Brand & Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 118, 110); // Teal 700
  doc.text("JASTIP ANGGUN JAYA", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Ekspedisi Spesialis Jawa — Manokwari, Papua Barat", margin, 23);

  // Right Side - Invoice Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 118, 110);
  doc.text("INVOICE", pageWidth - margin, 18, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(invoice.invoiceNo, pageWidth - margin, 24, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const issuedText = `Terbit: ${new Date(invoice.issuedAt).toLocaleDateString("id-ID")}`;
  const dueText = invoice.dueAt ? `Jatuh tempo: ${new Date(invoice.dueAt).toLocaleDateString("id-ID")}` : "Jatuh tempo: —";
  doc.text(issuedText, pageWidth - margin, 29, { align: "right" });
  doc.text(dueText, pageWidth - margin, 33, { align: "right" });

  if (print?.label) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(185, 28, 28);
    doc.text(`[ ${print.label.toUpperCase()} ]`, pageWidth - margin, 38, { align: "right" });
  }

  // Divider line
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.8);
  doc.line(margin, 41, pageWidth - margin, 41);

  // Customer & Status Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, 44, pageWidth - margin * 2, 20, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("DITAGIHKAN KEPADA:", margin + 4, 49);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(snapshot.customerName || "Pelanggan umum", margin + 4, 55);

  if (snapshot.transactionNo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`No. Transaksi: ${snapshot.transactionNo}`, margin + 4, 60);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("STATUS PEMBAYARAN:", pageWidth - margin - 4, 49, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (invoice.status === "LUNAS") {
    doc.setTextColor(22, 101, 52); // green 800
  } else if (invoice.status === "DIBAYAR_SEBAGIAN") {
    doc.setTextColor(180, 83, 9); // amber 700
  } else {
    doc.setTextColor(185, 28, 28); // red 700
  }
  doc.text(String(invoice.status).replace(/_/g, " "), pageWidth - margin - 4, 55, { align: "right" });

  // Items Table
  const tableData = invoice.items.map((item, index) => [
    index + 1,
    item.description || "Paket",
    item.qty || 1,
    item.weight ? `${item.weight} kg` : "-",
    formatRp(item.unitPrice),
    formatRp(item.lineTotal),
  ]);

  autoTable(doc, {
    startY: 68,
    head: [["#", "Rincian Kiriman", "Qty", "Berat", "Harga Satuan", "Subtotal"]],
    body: tableData,
    margin: { left: margin, right: margin, bottom: 20 },
    theme: "striped",
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
      cellPadding: 2.5,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      overflow: "linebreak",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      1: { cellWidth: "auto" },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "right", cellWidth: 22 },
      4: { halign: "right", cellWidth: 32 },
      5: { halign: "right", cellWidth: 34 },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 100;

  // Summary Box (Right aligned)
  const summaryWidth = 85;
  const summaryX = pageWidth - margin - summaryWidth;
  let currentY = finalY + 5;

  // Check if summary would overflow page
  if (currentY + 50 > pageHeight - 30) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(summaryX, currentY, summaryWidth, 42, 2, 2, "FD");

  const sPad = 4;
  let sY = currentY + 6;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("Subtotal:", summaryX + sPad, sY);
  doc.setFont("helvetica", "bold");
  doc.text(formatRp(invoice.subtotal), summaryX + summaryWidth - sPad, sY, { align: "right" });

  sY += 6;
  doc.setFont("helvetica", "normal");
  doc.text("Diskon:", summaryX + sPad, sY);
  doc.setFont("helvetica", "bold");
  doc.text(`-${formatRp(invoice.discount)}`, summaryX + summaryWidth - sPad, sY, { align: "right" });

  sY += 6;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.4);
  doc.line(summaryX + sPad, sY - 1, summaryX + summaryWidth - sPad, sY - 1);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 118, 110);
  doc.text("TOTAL:", summaryX + sPad, sY + 3);
  doc.text(formatRp(invoice.total), summaryX + summaryWidth - sPad, sY + 3, { align: "right" });

  sY += 9;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("DP / Terbayar:", summaryX + sPad, sY);
  doc.setFont("helvetica", "bold");
  doc.text(formatRp(invoice.downPayment), summaryX + summaryWidth - sPad, sY, { align: "right" });

  sY += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(180, 83, 9);
  doc.text("Sisa Piutang:", summaryX + sPad, sY);
  doc.text(formatRp(invoice.balance), summaryX + summaryWidth - sPad, sY, { align: "right" });

  // Notes & Signatures
  let noteY = currentY + 48;
  if (noteY + 35 > pageHeight - 15) {
    doc.addPage();
    noteY = 20;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Catatan:", margin, noteY);
  doc.text("• Invoice ini dibuat dari snapshot data resmi saat diterbitkan.", margin, noteY + 4);
  doc.text("• Perubahan tarif atau master data paket setelah penerbitan tidak mengubah invoice ini.", margin, noteY + 8);
  doc.text("• Pembayaran via transfer/QRIS harap mencantumkan nomor invoice pada berita transfer.", margin, noteY + 12);

  // Signatures
  const sigY = noteY + 30;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);

  doc.line(margin + 5, sigY, margin + 45, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Penerima / Customer", margin + 25, sigY + 4, { align: "center" });

  doc.line(pageWidth - margin - 50, sigY, pageWidth - margin - 5, sigY);
  doc.text("Owner / Penanggung Jawab", pageWidth - margin - 27.5, sigY + 4, { align: "center" });

  // Footer page numbering
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Jastip Anggun Jaya — Dokumen Resmi Invoice A4`, margin, pageHeight - 6);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const cleanInvoiceNo = (invoice.invoiceNo || "INV").replace(/[^a-zA-Z0-9-_]/g, "_");
  doc.save(`Invoice-${cleanInvoiceNo}.pdf`);
}
