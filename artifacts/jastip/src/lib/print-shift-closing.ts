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
    cashReceived: number;
    changeGiven: number;
    cashExpenses: number;
    refundCash: number;
    systemCash: number;
  };
  result: string;
};

export function buildShiftClosingDocument(payload: ShiftClosingPrintPayload) {
  const { shift, closing, summary, result } = payload;

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Laporan Closing Shift #${shift.id}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { width: 80mm; color: #111; font: 12px/1.35 Arial, sans-serif; padding: 5mm 4mm 7mm; }
      .center { text-align: center; }
      .business { font-size: 16px; font-weight: 800; letter-spacing: .3px; }
      .subtitle { color: #555; font-size: 10px; margin-top: 2px; text-transform: uppercase; }
      .title { display: inline-block; border: 1px solid #111; padding: 3px 8px; margin: 8px 0 2px; font-size: 11px; font-weight: 700; letter-spacing: .5px; }
      .rule { border-top: 1px dashed #777; margin: 9px 0; }
      .meta { color: #333; font-size: 10px; }
      .meta div { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
      .section-title { font-weight: 800; margin: 8px 0 4px; text-transform: uppercase; font-size: 10px; letter-spacing: .4px; }
      .row { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
      .row strong { text-align: right; }
      .emphasis { font-size: 14px; margin-top: 6px; border-top: 1px dotted #ccc; padding-top: 4px; }
      .note { color: #555; font-size: 10px; margin: -1px 0 4px; }
      .status-box { background: #f2f2f2; border: 1px solid #ddd; border-radius: 4px; padding: 6px 8px; margin-top: 10px; font-size: 11px; text-align: center; }
      .status-box strong { font-size: 13px; color: #000; }
      .footer { color: #666; font-size: 10px; margin-top: 15px; border-top: 1px dotted #aaa; padding-top: 8px; }
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
    <div class="section-title">Ringkasan Transaksi</div>
    ${row("Total Transaksi", String(summary.paymentCount))}
    ${row("Bayar Tunai (Cash)", String(summary.cashPaymentCount))}
    ${row("Bayar Transfer", String(summary.transferPaymentCount))}
    ${row("Bayar QRIS", String(summary.qrisPaymentCount))}
    ${row("Piutang (Belum Bayar)", String(summary.receivablePaymentCount))}

    <div class="rule"></div>
    <div class="section-title">Arus Kas Laci (Tunai)</div>
    ${row("Modal / Saldo Awal", formatRp(summary.openingBalance))}
    ${row("Kas Tunai Masuk", formatRp(summary.cashReceived))}
    ${summary.changeGiven > 0 ? row("Kembalian Keluar", `- ${formatRp(summary.changeGiven)}`) : ""}
    ${summary.cashExpenses > 0 ? row("Pengeluaran Operasional", `- ${formatRp(summary.cashExpenses)}`) : ""}
    ${summary.refundCash > 0 ? row("Reversal Kas (Void)", `- ${formatRp(summary.refundCash)}`) : ""}
    ${row("TOTAL KAS SISTEM", formatRp(summary.systemCash), true)}

    <div class="rule"></div>
    <div class="section-title">Rekonsiliasi Fisik</div>
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
