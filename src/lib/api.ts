/**
 * api.ts ― サーバー関数（Cloud Functions）を呼ぶための関数
 * ============================================================
 *
 * 募集（posts）は、匿名性を守るためにアプリから直接読めないようにしています。
 * そのかわりに、ここにある関数でサーバーにお願いして、
 * 「投稿者や反応した人の名前を取り除いた情報」だけを受け取ります。
 *
 * httpsCallable(functions, '関数の名前') で、サーバーの onCall 関数を呼べます。
 * <送るデータの型, 受け取るデータの型> を書いておくと、間違いをエディタが教えてくれます。
 */
import { httpsCallable } from '@react-native-firebase/functions';

import { functions } from './firebase';
import type { PublicPost } from './types';

/** 募集を作るときに送るデータ */
export interface NewPostInput {
  title: string;
  eventAt: number; // ミリ秒
  place: string;
  groupId: string;
  capacity: number;
  deadline: number | null; // null なら開催日時が締切になる
}

/** 呼び出しを短く書くための小さな関数 */
async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  const fn = httpsCallable<Req, Res>(functions, name);
  const result = await fn(data);
  return result.data;
}

export const api = {
  /** 募集を作る */
  createPost: (input: NewPostInput) => call<NewPostInput, { id: string }>('createPost', input),

  /** ホーム画面の一覧（あなた宛のゆる募 ／ あなたの募集） */
  getBoard: () => call<object, { incoming: PublicPost[]; mine: PublicPost[] }>('getBoard', {}),

  /** 募集 1 件の詳細 */
  getPost: (postId: string) =>
    call<{ postId: string }, PublicPost & { isParticipant: boolean }>('getPost', { postId }),

  /** 「参加する」を押す。人数が揃ったら confirmed: true が返ってくる */
  react: (postId: string) => call<{ postId: string }, { confirmed: boolean }>('react', { postId }),

  /** 「やっぱりやめる」 */
  unreact: (postId: string) => call<{ postId: string }, { ok: true }>('unreact', { postId }),

  /** 募集を取り下げる（投稿者だけ） */
  withdrawPost: (postId: string) => call<{ postId: string }, { ok: true }>('withdrawPost', { postId }),

  /** 電話番号の人が「ゆる募」を使っているか調べる（使っている人の番号だけが返ってくる） */
  checkRegistered: (phones: string[]) =>
    call<{ phones: string[] }, { registered: string[] }>('checkRegistered', { phones }),

  /** アカウントとデータをすべて削除する */
  deleteAccount: () => call<object, { ok: true }>('deleteAccount', {}),
};

/**
 * エラーから、画面に出すメッセージを取り出します。
 * サーバーで HttpsError を投げると、その文章が error.message に入って届きます。
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'うまくいきませんでした。通信状態を確認して、もう一度お試しください。';
}
