/**
 * cleanup.ts ― 保存期間（開催日から 30 日）が過ぎたデータを削除する処理
 * =======================================================================
 *
 * プライバシーポリシーで「開催日から 30 日後に削除する」と約束しているので、
 * 毎日 1 回（index.ts の deleteOldEvents）この処理を動かして、古いデータを消します。
 *
 * 消すもの（開催日時が 30 日より前の予定について）：
 *   ・募集（posts）と、その中の反応の記録（reactions）
 *   ・グループトーク（chats）と、その中のメッセージ（messages）
 *   ・その予定についてのお知らせ（notifications）
 *
 * データベース（db）を引数で受け取るようにしているのは、
 * 自動テスト（test/integration.test.ts）から直接呼び出して確かめられるようにするためです。
 */
import { Firestore, Timestamp } from 'firebase-admin/firestore';

import { chunk } from './logic';

/** 1 回に処理する最大件数（多すぎると時間切れになるので、残りは翌日に回す） */
const BATCH_LIMIT = 200;

/**
 * cutoffMillis（ミリ秒）より前に開催された予定のデータを削除し、消した予定の数を返します。
 */
export async function deleteEventsBefore(db: Firestore, cutoffMillis: number): Promise<number> {
  const cutoff = Timestamp.fromMillis(cutoffMillis);

  // 募集（静かに終了したものも含む）と、トーク。トークだけ残っている場合もあるので、両方から探します
  // （例：投稿者がアカウントを削除すると、募集は消えるがトークは残る）
  const [posts, chats] = await Promise.all([
    db.collection('posts').where('eventAt', '<=', cutoff).limit(BATCH_LIMIT).get(),
    db.collection('chats').where('eventAt', '<=', cutoff).limit(BATCH_LIMIT).get(),
  ]);
  // 募集とトークは同じ ID なので、Set で重複をなくします
  const ids = new Set([...posts.docs.map((d) => d.id), ...chats.docs.map((d) => d.id)]);

  for (const id of ids) {
    // recursiveDelete は、中に入っている子データ（反応・メッセージ）ごと消してくれます
    await db.recursiveDelete(db.collection('posts').doc(id));
    await db.recursiveDelete(db.collection('chats').doc(id));

    // この予定についてのお知らせも消す（全員分をまとめて探す）
    const notes = await db.collectionGroup('notifications').where('postId', '==', id).get();
    for (const group of chunk(notes.docs, 400)) {
      const batch = db.batch();
      group.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  return ids.size;
}
