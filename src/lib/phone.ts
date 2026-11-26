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
 * 文字の書き方の違いをそろえて、比べやすくします（検索・並べ替え用）。
 *   ・カタカナ → ひらがな（「タナカ」も「たなか」も同じ扱い）
 *   ・半角カナ・全角英数字 → ふつうの文字（「ﾀﾅｶ」→「たなか」、「ＡＢＣ」→「abc」）
 *   ・英字は小文字に、空白は取り除く（「田中 太郎」→「田中太郎」）
 */
export function normalizeForSearch(text: string): string {
  return (
    (text ?? '')
      // NFKC：半角カナを全角に、全角英数字を半角にそろえる Unicode の決まりごと
      .normalize('NFKC')
      // カタカナ（ァ〜ヶ）は、ひらがなより 0x60 だけ後ろの番号なので、引き算でひらがなにする
      .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .toLowerCase()
      .replace(/\s+/g, '')
  );
}

/** 検索用に下ごしらえした文字（電話帳を読み込んだときに 1 回だけ作っておく） */
export interface SearchIndex {
  text: string; // 名前と読みがなを、比べやすい形にしてつなげたもの
  digits: string; // 電話番号の数字（国際形式と 0 始まりの両方）
}

/**
 * 電話帳の 1 人分について、検索用の下ごしらえを作ります。
 * 1 文字入力するたびに全員分の変換をやり直すと重くなるので、読み込んだときに 1 回だけ作ります。
 */
export function buildSearchIndex(entry: { name: string; phone: string; reading?: string }): SearchIndex {
  return {
    // 名前と読みがなの間に改行を入れて、つなぎ目で偶然一致しないようにする
    text: `${normalizeForSearch(entry.name)}\n${normalizeForSearch(entry.reading ?? '')}`,
    digits: `${entry.phone.replace(/\D/g, '')}\n${displayPhone(entry.phone).replace(/\D/g, '')}`,
  };
}

/**
 * 検索欄に入れた言葉を、比べやすい形にしておきます（1 文字入力するたびに 1 回だけ）。
 *   word   … 名前・読みがなと比べる文字
 *   digits … 電話番号と比べる数字（数字が無ければ空）
 */
export function prepareQuery(keyword: string) {
  return { word: normalizeForSearch(keyword), digits: (keyword ?? '').replace(/\D/g, '') };
}

/**
 * 下ごしらえ済みの 1 人分が、検索の言葉に当てはまるかを調べます。
 *   ・名前か読みがなに言葉が含まれていれば当てはまる
 *     （ひらがな・カタカナ・半角カナ、英字の大文字・小文字の違いは気にしない）
 *   ・言葉に数字が入っていれば、電話番号でも探す（"090-1234" でも "+8190" でも見つかる）
 * 検索欄が空なら、全員が当てはまります。
 */
export function matchesIndex(index: SearchIndex, query: { word: string; digits: string }): boolean {
  if (!query.word) return true;
  if (index.text.includes(query.word)) return true;
  // 入力に数字が 1 つも無ければ、番号では探さない
  // （ここで空の文字と比べると「どの番号にも含まれる」ことになり、全員が当てはまってしまう）
  return query.digits.length > 0 && index.digits.includes(query.digits);
}

/** 1 人分だけを調べる、かんたん版（下ごしらえと判定をまとめて行う） */
export function matchesContact(entry: { name: string; phone: string; reading?: string }, keyword: string): boolean {
  return matchesIndex(buildSearchIndex(entry), prepareQuery(keyword));
}
