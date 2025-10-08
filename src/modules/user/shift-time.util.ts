// src/modules/shift/shift-time.util.ts
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440; // gói 0..1439
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
};
export const addMin = (hhmm: string, delta: number) => toHHMM(toMin(hhmm) + delta);

export type Window = { open: string; close: string };

export function getCheckWindows(shift: {
  startTime: string; endTime: string;
  checkInOpen?: string | null; checkInClose?: string | null;
  checkOutOpen?: string | null; checkOutClose?: string | null;
}): { in: Window; out: Window } {
  // default offset (phút): mở trước 15’, đóng sau 30’ (check-in)
  // và mở trước 30’, đóng sau 60’ (check-out)
  const inOpen  = shift.checkInOpen  ?? addMin(shift.startTime, -15);
  const inClose = shift.checkInClose ?? addMin(shift.startTime, +30);

  const outOpen  = shift.checkOutOpen  ?? addMin(shift.endTime, -30);
  const outClose = shift.checkOutClose ?? addMin(shift.endTime, +60);

  return { in: { open: inOpen, close: inClose }, out: { open: outOpen, close: outClose } };
}

export function within(hhmm: string, win: Window) {
  const x = toMin(hhmm);
  return toMin(win.open) <= x && x <= toMin(win.close);
}
