import * as crypto from "crypto";

/** Encode VALUE theo RFC3986 + thay %20 -> '+' */
export const encVal = (v: string) => encodeURIComponent(v).replace(/%20/g, "+");

/** Build key=value&... (sort ASC, chỉ encode VALUE) */
export const buildCanonical = (obj: Record<string, any>) => {
  const entries = Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null && v !== "");
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${encVal(String(v))}`).join("&");
};

/** HMAC-SHA512 */
export const hmacSHA512 = (secret: string, canonical: string) =>
  crypto.createHmac("sha512", secret).update(canonical, "utf8").digest("hex");

/** yyyyMMddHHmmss theo Asia/Ho_Chi_Minh */
const ymdHmsTZ = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
};

export const nowYmdHms = () => ymdHmsTZ(new Date());

/** Bỏ dấu, ép ASCII (để mô tả an toàn) */
export const toASCII = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");

/** Tạo TxnRef chỉ số, ≤ 20 ký tự, luôn mới */
export const numericTxnRef = (base: string) => {
  const digits = String(base || "").replace(/\D/g, "") || Date.now().toString();
  return (digits + Date.now().toString().slice(-4)).slice(-20);
};
