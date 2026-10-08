/**
 * types.ts ― アプリの中で使う「データの形」をまとめたファイル
 *
 * TypeScript では、データがどんな項目を持っているかを「型（type / interface）」で決めておけます。
 * 型を決めておくと、項目名の打ち間違いなどをエディタが教えてくれます。
 */

/** 募集の状態：open=募集中 / confirmed=開催確定 / closed=静かに終了 */
export type PostStatus = 'open' | 'confirmed' | 'closed';

/**
 * サーバーから受け取る募集。
 * ★ 投稿者が誰か（authorId）は入っていません。人数（interested）だけです。
 */
export interface PublicPost {
  id: string;
  title: string;
  eventAt: number; // ミリ秒
  place: string;
  capacity: number; // 開催人数（投稿者を含む）
  deadline: number; // ミリ秒
  status: PostStatus;
  interested: number; // 気になってる人（参加を押した人）の人数
  isMine: boolean; // 自分の募集か
  reacted: boolean; // 自分が「参加する」を押しているか
}

/** 利用者のプロフィール（Firestore の users/{uid}） */
export interface Profile {
  name: string;
  icon: string;
  phone: string;
  expoPushToken?: string;
}

/** グループのメンバー（電話帳から選んだ人、または手入力した人） */
export interface GroupMember {
  name: string; // 自分の電話帳での呼び名（自分にしか見えない）
  phone: string; // +81 から始まる形
}

/** 見せる相手グループ（Firestore の groups/{groupId}） */
export interface Group {
  id: string;
  ownerId: string;
  name: string;
  members: GroupMember[];
  memberPhones: string[]; // サーバーが「この人に見せてよいか」を調べるための電話番号の一覧
}

/** 開催確定後のグループトーク（Firestore の chats/{postId}） */
export interface Chat {
  id: string;
  title: string;
  eventAt: number;
  place: string;
  memberIds: string[];
  members: Record<string, { name: string; icon: string }>; // { 利用者ID: { 名前, アイコン } }
}

/** トークのメッセージ */
export interface Message {
  id: string;
  userId: string | null; // null はアプリからのお知らせ
  body: string;
  kind: 'normal' | 'absence' | 'system'; // ふつう / 不参加連絡 / お知らせ
  createdAt: number | null; // 送信直後はサーバーの時刻がまだ決まっていないので null のことがある
}

/** お知らせ（users/{uid}/notifications/{id}） */
export interface AppNotification {
  id: string;
  postId: string | null;
  body: string;
  isRead: boolean;
  createdAt: number | null;
}
