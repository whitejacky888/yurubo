/**
 * logic.ts ― 「ゆる募」のルールをまとめたファイル（サーバー側）
 * =================================================================
 *
 * ここには Firebase に関係しない「純粋な関数」だけを置いています。
 * 純粋な関数 = 同じ入力なら必ず同じ結果を返し、データベースなどを触らない関数。
 * こうしておくと、Firebase を動かさなくても自動テスト（logic.test.ts）で確かめられます。
 */

// ---------------------------------------------------------------------------
// 定数（決まった値）
// ---------------------------------------------------------------------------

/** 開催人数（投稿者本人を含む）の下限と上限 */
export const MIN_CAPACITY = 2;
export const MAX_CAPACITY = 20;

/** 文字数の上限 */
export const TITLE_MAX = 40;
export const PLACE_MAX = 40;

/** 1 つのグループに入れられる最大人数 */
export const GROUP_MEMBERS_MAX = 100;

/** 募集の状態：open=募集中 / confirmed=開催確定 / closed=静かに終了 */
export type PostStatus = 'open' | 'confirmed' | 'closed';

// ---------------------------------------------------------------------------
// 電話番号
// ---------------------------------------------------------------------------

/**
 * 電話番号の書き方を「+81 から始まる国際形式（E.164）」にそろえます。
 *
 * Firebase の電話番号ログインは "+819012345678" の形で番号を持っているので、
 * グループのメンバーの番号も同じ形にそろえておかないと、比べたときに一致しません。
 *
 * 例:
 *   normalizePhone("090-1234-5678")    → "+819012345678"
 *   normalizePhone("+81 90 1234 5678") → "+819012345678"
 *   normalizePhone("abc")              → ""（電話番号として読めないときは空文字）
 *
 * ※ アプリ側の src/lib/phone.ts にも同じ関数があります。直すときは両方直してください。
 */
export function normalizePhone(raw: string): string {
  const trimmed = (raw ?? '').trim();
  const digits = trimmed.replace(/\D/g, ''); // \D = 数字以外。数字以外をすべて消す
  if (!digits) return '';

  let e164: string;
  if (trimmed.startsWith('+')) {
    e164 = '+' + digits; // もともと国際形式
  } else if (digits.startsWith('0')) {
    e164 = '+81' + digits.slice(1); // 日本の 0 始まり → 先頭の 0 を +81 に
  } else if (digits.startsWith('81')) {
    e164 = '+' + digits; // 81 から始まる → + を付ける
  } else {
    return '';
  }
  // E.164 は「+」と、最大 15 桁の数字
  return /^\+\d{8,15}$/.test(e164) ? e164 : '';
}

// ---------------------------------------------------------------------------
// 募集の入力チェック
// ---------------------------------------------------------------------------

/** アプリから送られてくる「募集を作る」の中身 */
export interface CreatePostInput {
  title: unknown;
  eventAt: unknown; // ミリ秒（1970 年からの経過ミリ秒。Date.getTime() の値）
  place: unknown;
  groupId: unknown;
  capacity: unknown;
  deadline: unknown; // 省略可。省略したら開催日時を締切にする
}

/** チェックに通った、きれいな募集データ */
export interface ValidPost {
  title: string;
  eventAt: number;
  place: string;
  groupId: string;
  capacity: number;
  deadline: number;
}

/**
 * 募集の入力内容をチェックします。
 * アプリ側でもチェックしていますが、アプリは改造されるかもしれないので、
 * 「サーバー側でも必ずチェックする」のが安全なアプリ作りの基本です。
 *
 * @returns 問題なければ { ok: true, value }、問題があれば { ok: false, errors }
 */
export function validatePostInput(
  input: CreatePostInput,
  now: number,
): { ok: true; value: ValidPost } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > TITLE_MAX) {
    errors.push(`タイトルは 1〜${TITLE_MAX} 文字で入力してください`);
  }

  const place = typeof input.place === 'string' ? input.place.trim() : '';
  if (place.length > PLACE_MAX) {
    errors.push(`場所は ${PLACE_MAX} 文字以内で入力してください`);
  }

  const eventAt = typeof input.eventAt === 'number' ? input.eventAt : NaN;
  if (!Number.isFinite(eventAt) || eventAt <= now) {
    errors.push('開催日時は、これから先の日時を選んでください');
  }

  // 締切が送られてこなかったら、開催日時を締切にします
  const deadline =
    input.deadline === undefined || input.deadline === null
      ? eventAt
      : typeof input.deadline === 'number'
        ? input.deadline
        : NaN;
  if (!Number.isFinite(deadline) || deadline <= now) {
    errors.push('締切は、これから先の日時を選んでください');
  } else if (Number.isFinite(eventAt) && deadline > eventAt) {
    errors.push('締切は開催日時より前にしてください');
  }

  const groupId = typeof input.groupId === 'string' ? input.groupId : '';
  if (!groupId) {
    errors.push('見せる相手のグループを選んでください');
  }

  const capacity = typeof input.capacity === 'number' ? input.capacity : NaN;
  if (!Number.isInteger(capacity) || capacity < MIN_CAPACITY || capacity > MAX_CAPACITY) {
    errors.push(`開催人数は ${MIN_CAPACITY}〜${MAX_CAPACITY} 人で選んでください`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { title, eventAt, place, groupId, capacity, deadline } };
}

// ---------------------------------------------------------------------------
// 開催確定・終了の判定
// ---------------------------------------------------------------------------

/**
 * 開催人数に達したか（＝開催確定にしてよいか）を判定します。
 * 「投稿者 1 人 ＋ 参加を押した人数」が開催人数以上なら true。
 */
export function isFull(reactionCount: number, capacity: number): boolean {
  return 1 + reactionCount >= capacity;
}

/** 締切を過ぎているかを判定します。 */
export function isExpired(deadline: number, now: number): boolean {
  return deadline <= now;
}

// ---------------------------------------------------------------------------
// 匿名設計：アプリに返してよい情報だけに絞る
// ---------------------------------------------------------------------------

/** データベースに保存されている募集（サーバーだけが見る） */
export interface StoredPost {
  authorId: string; // ★ 投稿者。アプリには絶対に返さない
  groupId: string;
  title: string;
  eventAt: number;
  place: string;
  capacity: number;
  deadline: number;
  status: PostStatus;
  reactionCount: number;
}

/** アプリに返す募集（投稿者の情報は入っていない） */
export interface PublicPost {
  id: string;
  title: string;
  eventAt: number;
  place: string;
  capacity: number;
  deadline: number;
  status: PostStatus;
  interested: number; // 「気になってる人」の人数
  isMine: boolean; // 自分の募集か
  reacted: boolean; // 自分が「参加する」を押しているか
}

/**
 * 【匿名設計のかなめ】
 * サーバーに保存されている募集から、アプリに返してよい項目だけを取り出します。
 *
 * authorId（誰が投稿したか）はここで捨てるので、アプリには届きません。
 * 反応した人の一覧も返さず、人数（interested）だけを返します。
 * 返すのは「自分の募集かどうか（isMine）」と「自分が押したか（reacted）」だけ。
 * どちらも自分自身についての情報なので、他人の情報は漏れません。
 */
export function toPublicPost(
  id: string,
  post: StoredPost,
  viewerId: string,
  reacted: boolean,
): PublicPost {
  return {
    id,
    title: post.title,
    eventAt: post.eventAt,
    place: post.place,
    capacity: post.capacity,
    deadline: post.deadline,
    status: post.status,
    interested: post.reactionCount,
    isMine: post.authorId === viewerId,
    reacted,
  };
}

/**
 * 配列を size 個ずつに分けます。
 * Firestore の「in」検索は一度に 30 個までしか指定できないので、分けて検索するのに使います。
 *
 * 例: chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
