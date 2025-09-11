import * as crypto from 'crypto';

/** chuẩn hóa object theo ASCII key tăng dần, bỏ key rỗng/undefined/null */
export function sortObject(obj: Record<string, any>) {
  const sorted: Record<string, any> = {};
  Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .sort()
    .forEach((k) => (sorted[k] = obj[k]));
  return sorted;
}

/** encode theo querystring, không kèm hash */
export function toQueryString(obj: Record<string, any>) {
  return Object.keys(obj)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(obj[k]))}`)
    .join('&');
}

/** ký HMAC-SHA512 */
export function hmacSHA512(secret: string, data: string) {
  return crypto.createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

/** yyyyMMddHHmmss theo GMT+7 */
export function nowYmdHisGMT7(date = new Date()) {
  const tzOffsetMs = 7 * 60 * 60 * 1000;
  const t = new Date(date.getTime() + tzOffsetMs);
  const yyyy = t.getUTCFullYear();
  const MM = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const HH = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  const ss = String(t.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

/** cộng phút và trả về yyyyMMddHHmmss GMT+7 */
export function addMinutesYmdHisGMT7(minutes: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return nowYmdHisGMT7(d);
}
