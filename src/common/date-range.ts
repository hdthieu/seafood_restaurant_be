export type RangeKey = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';

export function resolveRange(range: RangeKey): { start: Date; end: Date } {
  const now = new Date();

  // đặt về 00:00:00
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (range === 'today') {
    const s = startOfDay(now);
    const e = endOfDay(now);
    return { start: s, end: e };
  }

  if (range === 'yesterday') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y) };
  }

  if (range === 'last7') {
    const s = new Date(now);
    s.setDate(now.getDate() - 6); // gồm cả hôm nay => 7 ngày
    return { start: startOfDay(s), end: endOfDay(now) };
  }

  if (range === 'thisMonth') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { start: s, end: e };
  }

  // lastMonth
  const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const e = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
  return { start: s, end: e };
}
