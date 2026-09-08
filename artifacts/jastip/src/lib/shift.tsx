import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";

export type ShiftSession = {
  id: number;
  adminId: number;
  shiftType: "PAGI" | "MALAM";
  terminalId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  openingBalance: string | number;
  status: "AKTIF" | "CLOSED";
  createdAt: string;
};

export type ShiftSummary = {
  paymentCount: number;
  cashPaymentCount: number;
  transferPaymentCount: number;
  receivablePaymentCount: number;
  cashReceived: number;
  changeGiven: number;
  cashExpenses: number;
};

type ShiftContextValue = {
  shift: ShiftSession | null;
  summary: ShiftSummary | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  openShift: (input: {
    shiftType: "PAGI" | "MALAM";
    terminalId?: string;
    openingBalance: number;
  }) => Promise<any>;
  beginClosing: (shiftId: number) => Promise<any>;
  completeClosing: (
    shiftId: number,
    closingId: number,
    actualCash: number,
    alasanSelisih?: string,
  ) => Promise<any>;
};

const ShiftContext = createContext<ShiftContextValue | undefined>(undefined);

async function shiftRequest(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("jaj_token");
  const response = await fetch(`/api/shifts${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Gagal memproses shift");
  }
  return body;
}

export function useShiftRequest() {
  return shiftRequest;
}

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [shift, setShift] = useState<ShiftSession | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !["admin", "owner"].includes(user.role)) {
      setShift(null);
      setSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const body = await shiftRequest("/current");
      setShift(body.shift || null);
      setSummary(body.summary || null);
    } catch {
      setShift(null);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ShiftContextValue>(
    () => ({
      shift,
      summary,
      isLoading,
      refresh,
      openShift: async (input) => {
        const result = await shiftRequest("/open", {
          method: "POST",
          body: JSON.stringify(input),
        });
        await refresh();
        return result;
      },
      beginClosing: (shiftId) =>
        shiftRequest(`/${shiftId}/close`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      completeClosing: async (shiftId, closingId, actualCash, alasanSelisih) => {
        const result = await shiftRequest(`/${shiftId}/close`, {
          method: "POST",
          body: JSON.stringify({ closingId, actualCash, alasanSelisih }),
        });
        await refresh();
        return result;
      },
    }),
    [shift, summary, isLoading, refresh],
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift() {
  const context = useContext(ShiftContext);
  if (!context) throw new Error("useShift must be used within ShiftProvider");
  return context;
}