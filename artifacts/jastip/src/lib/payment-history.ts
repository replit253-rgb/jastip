export type ResolvedPaymentCategory =
  | "tunai"
  | "transfer"
  | "qris"
  | "piutang"
  | "void_reversal";

export function formatRp(n: unknown): string {
  const num = Number(n ?? 0);
  if (!Number.isFinite(num)) return "Rp 0";
  if (num < 0) {
    return `-Rp ${Math.abs(num).toLocaleString("id-ID")}`;
  }
  return `Rp ${num.toLocaleString("id-ID")}`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d?: string | null): string {
  if (!d) return "-";
  const dt = new Date(d);
  const datePart = dt.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = dt.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} — ${timePart}`;
}

export function isVoidReversal(pmt: any): boolean {
  return String(pmt?.paymentType || "").toUpperCase() === "VOID_REVERSAL";
}

export function resolvePaymentCategory(pmt: any): ResolvedPaymentCategory {
  if (isVoidReversal(pmt)) return "void_reversal";
  const method = String(pmt?.paymentMethod || "").toLowerCase().trim();
  if (method === "tunai" || method === "transfer" || method === "qris") {
    return method;
  }
  const type = String(pmt?.paymentType || "").toLowerCase().trim();
  if (type === "tunai" || type === "transfer" || type === "qris" || type === "piutang") {
    return type;
  }
  return "tunai";
}

export function getPaymentMethodLabel(pmt: any): string {
  const cat = resolvePaymentCategory(pmt);
  switch (cat) {
    case "tunai":
      return "Tunai";
    case "transfer":
      return "Transfer";
    case "qris":
      return "QRIS";
    case "piutang":
      return "Piutang";
    case "void_reversal":
      return "VOID Reversal";
  }
}

export function getPaymentTypeLabel(pmt: any): string {
  const raw = String(pmt?.paymentType || "").trim();
  switch (raw) {
    case "TRANSAKSI_BARU":
      return "Pembayaran";
    case "PELUNASAN_PIUTANG":
      return "Pelunasan Piutang";
    case "CICILAN":
      return "Cicilan";
    case "VOID_REVERSAL":
      return "VOID Reversal";
    case "tunai":
    case "transfer":
    case "qris":
    case "piutang":
      return "Pembayaran";
    default:
      return raw || "Pembayaran";
  }
}

/**
 * Nominal yang dibayar (paidAmount) untuk ditampilkan pada setiap baris.
 * Untuk VOID_REVERSAL selalu bernilai negatif.
 */
export function getDisplayedPaidAmount(pmt: any): number {
  const raw = pmt?.paidAmount != null ? Number(pmt.paidAmount) : Number(pmt?.totalAmount || 0);
  if (isVoidReversal(pmt)) {
    return -Math.abs(raw);
  }
  return raw;
}

/**
 * Nominal bersih kas/pembayaran untuk pencocokan subtotal & kas
 * (menggunakan totalAmount yang dikreditkan agar pembayaran tunai dengan kembalian cocok dengan total transaksi,
 * dan bernilai negatif untuk VOID_REVERSAL).
 */
export function getNetPaymentAmount(pmt: any): number {
  const raw = Number(pmt?.totalAmount ?? pmt?.paidAmount ?? 0);
  if (isVoidReversal(pmt)) {
    return -Math.abs(raw);
  }
  return raw;
}

export interface PaymentSubtotals {
  tunai: number;
  transfer: number;
  qris: number;
  piutang: number;
  voidReversal: number;
  totalKeseluruhan: number;
  counts: {
    all: number;
    tunai: number;
    transfer: number;
    qris: number;
    piutang: number;
    voidReversal: number;
  };
}

export function calculatePaymentSubtotals(payments: any[]): PaymentSubtotals {
  let tunai = 0;
  let transfer = 0;
  let qris = 0;
  let piutang = 0;
  let voidReversal = 0;
  let cTunai = 0;
  let cTransfer = 0;
  let cQris = 0;
  let cPiutang = 0;
  let cVoid = 0;

  for (const p of payments) {
    const cat = resolvePaymentCategory(p);
    const amt = getNetPaymentAmount(p);
    if (cat === "tunai") {
      tunai += amt;
      cTunai++;
    } else if (cat === "transfer") {
      transfer += amt;
      cTransfer++;
    } else if (cat === "qris") {
      qris += amt;
      cQris++;
    } else if (cat === "piutang") {
      piutang += amt;
      cPiutang++;
    } else if (cat === "void_reversal") {
      voidReversal += amt; // negative
      cVoid++;
    }
  }

  return {
    tunai,
    transfer,
    qris,
    piutang,
    voidReversal,
    totalKeseluruhan: tunai + transfer + qris + piutang + voidReversal,
    counts: {
      all: payments.length,
      tunai: cTunai,
      transfer: cTransfer,
      qris: cQris,
      piutang: cPiutang,
      voidReversal: cVoid,
    },
  };
}

export function resolveBatchIdForPayment(pmt: any, pkgMap: Record<number, any>): number | null {
  const ids: number[] = Array.isArray(pmt?.packageIds) ? pmt.packageIds : [];
  for (const id of ids) {
    const bId = pkgMap[id]?.batchId;
    if (bId != null) return Number(bId);
  }
  return null;
}

export function resolveServiceTypeForPayment(pmt: any, pkgMap: Record<number, any>): string {
  const fromSummary = pmt?.packageSummary?.[0]?.serviceType;
  if (fromSummary) return String(fromSummary).toLowerCase().trim();
  const ids: number[] = Array.isArray(pmt?.packageIds) ? pmt.packageIds : [];
  for (const id of ids) {
    const svc = pkgMap[id]?.serviceType;
    if (svc) return String(svc).toLowerCase().trim();
  }
  return "";
}
