/**
 * phone.ts ― 電話番号を扱う関数
 *
 * ※ サーバー側の functions/src/logic.ts にも同じ normalizePhone があります。
 *   直すときは両方直してください（アプリとサーバーで番号の形がずれると、グループが一致しなくなります）。
 */

/**
 * 電話番号の書き方を「+81 から始まる国際形式（E.164）」にそろえます。
 *   "090-1234-5678" → "+819012345678"
 *   読めないときは ""（空文字）を返します。
 */
export function normalizePhone(raw: string): string {
  const trimmed = (raw ?? '').trim();
  const digits = trimmed.replace(/\D/g, ''); // 数字以外を消す
  if (!digits) return '';

  let e164: string;
  if (trimmed.startsWith('+')) e164 = '+' + digits;
  else if (digits.startsWith('0')) e164 = '+81' + digits.slice(1);
  else if (digits.startsWith('81')) e164 = '+' + digits;
  else return '';

  return /^\+\d{8,15}$/.test(e164) ? e164 : '';
}

/**
 * 画面に出すために、国際形式を日本の書き方に戻します。
 *   "+819012345678" → "090-1234-5678"
 */
export function displayPhone(e164: string): string {
  if (!e164.startsWith('+81')) return e164;
  const local = '0' + e164.slice(3);
  if (local.length === 11) return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `${local.slice(0, 2)}-${local.slice(2, 6)}-${local.slice(6)}`;
  return local;
}

/**
 * 電話帳の 1 人が、検索欄に入れた言葉に当てはまるかを調べます。
 *   ・名前に言葉が含まれていれば当てはまる（英字は大文字・小文字を区別しない）
 *   ・言葉に数字が入っていれば、電話番号でも探す（"090-1234" でも "+8190" でも見つかる）
 * 検索欄が空なら、全員が当てはまります。
 */
export function matchesContact(entry: { name: string; phone: string }, keyword: string): boolean {
  const word = keyword.trim().toLowerCase();
  if (!word) return true;
  if (entry.name.toLowerCase().includes(word)) return true;

  // 入力に数字が 1 つも無ければ、番号では探さない
  // （ここで空の文字と比べると「どの番号にも含まれる」ことになり、全員が当てはまってしまう）
  const digits = word.replace(/\D/g, '');
  if (!digits) return false;

  const international = entry.phone.replace(/\D/g, ''); // 例：819012345678
  const local = displayPhone(entry.phone).replace(/\D/g, ''); // 例：09012345678
  return international.includes(digits) || local.includes(digits);
}
