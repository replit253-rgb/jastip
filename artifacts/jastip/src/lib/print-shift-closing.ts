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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jayapura",
  });
}

function row(label: string, value: string, emphasis = false) {
  return `<div class="row${emphasis ? " emphasis" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export type ShiftClosingPrintPayload = {
  shift: {
    id: number;
    adminName?: string | null;
    shiftType: string;
    terminalId?: string | null;
    actualStart: string;
    actualEnd?: string | null;
    openingBalance: number | string;
  };
  closing: {
    systemCash: number;
    actualCash: number;
    selisih: number;
    alasanSelisih?: string | null;
    closedAt?: string | null;
  };
  summary: {
    openingBalance: number;
    paymentCount: number;
    cashPaymentCount: number;
    transferPaymentCount: number;
    qrisPaymentCount: number;
    receivablePaymentCount: number;
    totalOmzet?: number;
    totalTransactions?: number;
    cashOmzet?: number;
    transferOmzet?: number;
    qrisOmzet?: number;
    receivableOmzet?: number;
    totalPaymentsReceived?: number;
    newReceivables?: number;
    oldReceivablesReceived?: number;
    cashReceived: number;
    changeGiven: number;
    cashExpenses: number;
    nonCashExpenses?: number;
    refundCash: number;
    systemCash: number;
  };
  result: string;
};

export function buildShiftClosingDocument(payload: ShiftClosingPrintPayload) {
  const { shift, closing, summary, result } = payload;

  const totalOmzet = summary.totalOmzet ?? (summary.cashOmzet || 0) + (summary.transferOmzet || 0) + (summary.qrisOmzet || 0);
  const totalTrx = summary.totalTransactions ?? summary.paymentCount;
  const cashOmz = summary.cashOmzet ?? 0;
  const transferOmz = summary.transferOmzet ?? 0;
  const qrisOmz = summary.qrisOmzet ?? 0;
  const totalPaymentsRec = summary.totalPaymentsReceived ?? (cashOmz + transferOmz + qrisOmz + (summary.oldReceivablesReceived || 0));
  const newRec = summary.newReceivables ?? 0;
  const oldRec = summary.oldReceivablesReceived ?? summary.receivableOmzet ?? 0;
  const nonCashExp = summary.nonCashExpenses ?? 0;

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Laporan Closing Shift #${shift.id}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { width: 80mm; color: #111; font: 11px/1.35 Arial, sans-serif; padding: 5mm 4mm 7mm; }
      .center { text-align: center; }
      .business { font-size: 15px; font-weight: 800; letter-spacing: .3px; }
      .subtitle { color: #555; font-size: 9px; margin-top: 2px; text-transform: uppercase; }
      .title { display: inline-block; border: 1px solid #111; padding: 3px 8px; margin: 8px 0 2px; font-size: 10px; font-weight: 700; letter-spacing: .5px; }
      .rule { border-top: 1px dashed #777; margin: 8px 0; }
      .meta { color: #333; font-size: 9.5px; }
      .meta div { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
      .section-title { font-weight: 800; margin: 7px 0 3px; text-transform: uppercase; font-size: 9.5px; letter-spacing: .4px; color: #1a1a1a; background: #f4f4f4; padding: 2px 4px; }
      .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
      .row strong { text-align: right; }
      .emphasis { font-size: 13px; margin-top: 5px; border-top: 1px dotted #ccc; padding-top: 3px; font-weight: bold; }
      .note { color: #555; font-size: 9px; margin: -1px 0 3px; }
      .status-box { background: #f2f2f2; border: 1px solid #ddd; border-radius: 4px; padding: 5px 8px; margin-top: 8px; font-size: 10.5px; text-align: center; }
      .status-box strong { font-size: 12px; color: #000; }
      .footer { color: #666; font-size: 9px; margin-top: 12px; border-top: 1px dotted #aaa; padding-top: 6px; }
      @media screen { body { margin: 10px auto; box-shadow: 0 0 0 1px #ddd; } }
    </style>
  </head>
  <body>
    <div class="center">
      <div class="business">JASTIP ANGGUN JAYA</div>
      <div class="subtitle">Sistem Kasir & Kargo Anggun Jaya</div>
      <div class="title">LAPORAN CLOSING SHIFT</div>
    </div>
    <div class="rule"></div>
    <div class="meta">
      <div><span>Shift ID</span><strong>#${shift.id}</strong></div>
      <div><span>Tipe Shift</span><strong>${escapeHtml(shift.shiftType)}</strong></div>
      <div><span>Terminal</span><strong>${escapeHtml(shift.terminalId || "-")}</strong></div>
      <div><span>Kasir / Admin</span><strong>${escapeHtml(shift.adminName || "Admin")}</strong></div>
      <div><span>Waktu Buka</span><strong>${escapeHtml(formatDate(shift.actualStart))} WIT</strong></div>
      <div><span>Waktu Tutup</span><strong>${escapeHtml(formatDate(shift.actualEnd || closing.closedAt))} WIT</strong></div>
    </div>
    
    <div class="rule"></div>
    <div class="section-title">Ringkasan Pendapatan</div>
    ${row("Total Omzet Sah", formatRp(totalOmzet))}
    ${row("Total Transaksi Sah", `${totalTrx} transaksi`)}

    <div class="section-title">Rincian Metode Pembayaran</div>
    ${row("Cash / Tunai", `${formatRp(cashOmz)} (${summary.cashPaymentCount}x)`)}
    ${row("Transfer Bank", `${formatRp(transferOmz)} (${summary.transferPaymentCount}x)`)}
    ${row("QRIS / Lainnya", `${formatRp(qrisOmz)} (${summary.qrisPaymentCount}x)`)}
    ${row("Total Pembayaran Masuk", formatRp(totalPaymentsRec), true)}

    <div class="section-title">Piutang & Pelunasan</div>
    ${row("Piutang Baru (Belum Lunas)", formatRp(newRec))}
    ${row("Penerimaan Piutang Lama", formatRp(oldRec))}

    <div class="section-title">Pengeluaran Operasional</div>
    ${row("Pengeluaran Kas Tunai", formatRp(summary.cashExpenses))}
    ${nonCashExp > 0 ? row("Pengeluaran Non-Tunai", formatRp(nonCashExp)) : ""}

    <div class="section-title">Arus Kas Laci (Fisik)</div>
    ${row("Modal / Saldo Awal", formatRp(summary.openingBalance))}
    ${row("Penerimaan Tunai (Bruto)", formatRp(summary.cashReceived))}
    ${summary.changeGiven > 0 ? row("Kembalian Keluar", `- ${formatRp(summary.changeGiven)}`) : ""}
    ${summary.cashExpenses > 0 ? row("Pengeluaran Kas Tunai", `- ${formatRp(summary.cashExpenses)}`) : ""}
    ${summary.refundCash > 0 ? row("Reversal Kas (VOID)", `- ${formatRp(summary.refundCash)}`) : ""}
    ${row("TOTAL KAS SISTEM", formatRp(summary.systemCash), true)}

    <div class="section-title">Rekonsiliasi Fisik & Selisih</div>
    ${row("Kas Fisik Aktual", formatRp(closing.actualCash))}
    ${row("Selisih Kas", (closing.selisih >= 0 ? "+" : "") + formatRp(closing.selisih), true)}
    ${closing.alasanSelisih ? `<div class="note" style="margin-top: 4px;">Alasan: "${escapeHtml(closing.alasanSelisih)}"</div>` : ""}

    <div class="status-box">
      Status Rekonsiliasi:<br/>
      <strong>${escapeHtml(result)}</strong>
    </div>

    <div class="footer center">
      Laporan dicetak otomatis oleh sistem.<br />
      Waktu Cetak: ${escapeHtml(formatDate(new Date().toISOString()))} WIT
    </div>
    <script>window.addEventListener("load", () => setTimeout(() => window.print(), 150));</script>
  </body>
</html>`;
}
