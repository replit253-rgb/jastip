export function safeIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? new Date().toISOString() : val.toISOString();
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function safeIsoStringOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString();
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function dateStartsWith(val: unknown, prefix: string): boolean {
  if (!val || !prefix) return false;
  const iso = safeIsoStringOrNull(val);
  return iso ? iso.startsWith(prefix) : false;
}
