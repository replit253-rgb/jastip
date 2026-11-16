import { db, settingsTable } from "@workspace/db";

export interface PelniTier {
  maxKg: number | null; // null berarti tidak ada batas atas (catch-all)
  rate: number;
}

export interface BaseRates {
  pesawatRate: number;
  hematRate: number;
  kargoRate: number;
  pelniTiersJakarta: PelniTier[];
  pelniTiersSurabaya: PelniTier[];
}

export const DEFAULT_PELNI_TIERS_JAKARTA: PelniTier[] = [
  { maxKg: 10.1, rate: 20000 },
  { maxKg: 20.1, rate: 19000 },
  { maxKg: 40.1, rate: 18000 },
  { maxKg: 80.1, rate: 17000 },
  { maxKg: null, rate: 16000 },
];

export const DEFAULT_PELNI_TIERS_SURABAYA: PelniTier[] = [
  { maxKg: 10, rate: 18000 },
  { maxKg: 20, rate: 17000 },
  { maxKg: 40, rate: 16000 },
  { maxKg: null, rate: 15500 },
];

export const DEFAULT_BASE_RATES: BaseRates = {
  pesawatRate: 77000,
  hematRate: 10000,
  kargoRate: 1900000,
  pelniTiersJakarta: DEFAULT_PELNI_TIERS_JAKARTA,
  pelniTiersSurabaya: DEFAULT_PELNI_TIERS_SURABAYA,
};

export function normalizePelniTiers(
  raw: unknown,
  fallback: PelniTier[],
): PelniTier[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallback.map((t) => ({ ...t }));
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return fallback.map((t) => ({ ...t }));
  }

  const normalized: PelniTier[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, any>;
    const rate = Number(obj.rate ?? obj.ratePerKg);
    if (!Number.isFinite(rate) || rate <= 0) continue;

    const rawMax = obj.maxKg ?? obj.maxWeight;
    let maxKg: number | null = null;
    if (rawMax !== null && rawMax !== undefined && rawMax !== "") {
      const n = Number(rawMax);
      if (Number.isFinite(n) && n > 0 && n < 999999) {
        maxKg = n;
      }
    }
    normalized.push({ maxKg, rate });
  }

  if (normalized.length === 0) {
    return fallback.map((t) => ({ ...t }));
  }

  // Urutkan tier berbatas naik, lalu tier tak terbatas (null) di akhir
  return normalized.sort((a, b) => {
    if (a.maxKg === null && b.maxKg === null) return 0;
    if (a.maxKg === null) return 1;
    if (b.maxKg === null) return -1;
    return a.maxKg - b.maxKg;
  });
}

function parsePositiveRate(raw: unknown, fallback: number): number {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getBaseRates(): Promise<BaseRates> {
  try {
    const rows = await db.select().from(settingsTable);
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r?.key) map.set(String(r.key), String(r.value));
    }

    return {
      pesawatRate: parsePositiveRate(
        map.get("pesawatRate"),
        DEFAULT_BASE_RATES.pesawatRate,
      ),
      hematRate: parsePositiveRate(
        map.get("hematRate"),
        DEFAULT_BASE_RATES.hematRate,
      ),
      kargoRate: parsePositiveRate(
        map.get("kargoRate"),
        DEFAULT_BASE_RATES.kargoRate,
      ),
      pelniTiersJakarta: normalizePelniTiers(
        map.get("pelniTiersJakarta"),
        DEFAULT_PELNI_TIERS_JAKARTA,
      ),
      pelniTiersSurabaya: normalizePelniTiers(
        map.get("pelniTiersSurabaya"),
        DEFAULT_PELNI_TIERS_SURABAYA,
      ),
    };
  } catch {
    return {
      pesawatRate: DEFAULT_BASE_RATES.pesawatRate,
      hematRate: DEFAULT_BASE_RATES.hematRate,
      kargoRate: DEFAULT_BASE_RATES.kargoRate,
      pelniTiersJakarta: DEFAULT_PELNI_TIERS_JAKARTA.map((t) => ({ ...t })),
      pelniTiersSurabaya: DEFAULT_PELNI_TIERS_SURABAYA.map((t) => ({ ...t })),
    };
  }
}

export function getPelniRateByTotalWeightFromTiers(
  totalWeight: number,
  deliveryRoute: string | null | undefined,
  baseRates: Pick<BaseRates, "pelniTiersJakarta" | "pelniTiersSurabaya">,
): number | null {
  if (!deliveryRoute || !totalWeight || totalWeight <= 0) return null;
  const routeNorm = String(deliveryRoute).trim().toLowerCase();

  let tiers: PelniTier[] | null = null;
  if (
    routeNorm === "jakarta → manokwari" ||
    routeNorm === "jakarta -> manokwari" ||
    (routeNorm.startsWith("jakarta") && !routeNorm.includes("surabaya"))
  ) {
    tiers = baseRates.pelniTiersJakarta;
  } else if (
    routeNorm === "surabaya → manokwari" ||
    routeNorm === "surabaya -> manokwari" ||
    (routeNorm.startsWith("surabaya") && !routeNorm.includes("jakarta"))
  ) {
    tiers = baseRates.pelniTiersSurabaya;
  }

  if (!tiers || tiers.length === 0) return null;

  for (const tier of tiers) {
    if (tier.maxKg === null || totalWeight <= tier.maxKg) {
      return tier.rate;
    }
  }
  return tiers[tiers.length - 1].rate;
}
