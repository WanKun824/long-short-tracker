const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1_000;

function timestamp(value: string | number | Date) {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : Date.parse(value);
}

export function hongKongDateKey(value: string | number | Date) {
  const valueTimestamp = timestamp(value);
  if (!Number.isFinite(valueTimestamp)) return null;
  return new Date(valueTimestamp + HONG_KONG_OFFSET_MS).toISOString().slice(0, 10);
}

export function alreadyCheckedOnHongKongDate(lastRefresh: string | null | undefined, now = Date.now()) {
  if (!lastRefresh) return false;
  const lastDate = hongKongDateKey(lastRefresh);
  const currentDate = hongKongDateKey(now);
  return Boolean(lastDate && currentDate && lastDate === currentDate);
}
