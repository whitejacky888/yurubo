/**
 * index.ts ― 「ゆる募」のサーバー側の処理（Cloud Functions for Firebase）
 * ==========================================================================
 *
 * 【なぜサーバー側の処理が必要なの？】
 * 「ゆる募」でいちばん大事なのは、開催が確定するまで
 *   ・誰が投稿したか
 *   ・誰が反応したか
 * を誰にも見せないことです。
 *
 * もしアプリが Firestore（データベース）から募集を直接読めると、
 * 画面に出していなくても、アプリを改造すれば「投稿者の ID」を覗けてしまいます。
 * そこで、募集（posts）はアプリから直接読めないようにして（firestore.rules で禁止）、
 * 必ずここにある関数を通して「人数だけ」を返すようにしています。
 *
 * 【ここにある関数】（アプリから呼ぶもの＝ onCall）
 *   createPost       … 募集を作る
 *   getBoard         … ホーム画面に出す募集の一覧
 *   getPost          … 募集 1 件の詳細
 *   react / unreact  … 「参加する」を押す／取り消す（揃ったら開催確定）
 *   withdrawPost     … 投稿者が募集を取り下げる
 *   checkRegistered  … 電話番号の人が「ゆる募」を使っているか調べる（招待ボタン用）
 *   deleteAccount    … アカウントとデータを削除する
 * 【自動で動くもの】
 *   closeExpiredPosts … 10 分ごとに、締切を過ぎた募集を静かに終了させる
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { setGlobalOptions } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  chunk,
  isExpired,
  isFull,
  normalizePhone,
  toPublicPost,
  validatePostInput,
  type CreatePostInput,
  type PublicPost,
  type StoredPost,
} from './logic';

// ---------------------------------------------------------------------------
// 準備
// ---------------------------------------------------------------------------
initializeApp(); // Firebase の管理者用 SDK を使えるようにする
const db = getFirestore();

// すべての関数を東京リージョン（asia-northeast1）で動かします。
// 利用者の近くで動かすと、反応が速くなります。
// ※ アプリ側（src/lib/firebase.ts）の REGION と同じにしてください。
setGlobalOptions({ region: 'asia-northeast1', maxInstances: 10 });

// コレクション（データの入れ物）への近道
const usersCol = () => db.collection('users');
const groupsCol = () => db.collection('groups');
const postsCol = () => db.collection('posts');
const chatsCol = () => db.collection('chats');

// ---------------------------------------------------------------------------
// 小さな便利関数
// ---------------------------------------------------------------------------

/**
 * ログインしているかを確かめて、利用者の ID と電話番号を返します。
 * ログインしていなければエラーにします。
 */
function requireUser(request: CallableRequest): { uid: string; phone: string } {
  const uid = request.auth?.uid;
  // 電話番号ログインをすると、ログイン情報（トークン）に phone_number が入っています
  const phone = request.auth?.token.phone_number;
  if (!uid || !phone) {
    throw new HttpsError('unauthenticated', 'ログインしてください');
  }
  return { uid, phone };
}

/** 文字列の ID を受け取ります。おかしな値ならエラーにします。 */
function requireId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128 || value.includes('/')) {
    throw new HttpsError('invalid-argument', 'ID が正しくありません');
  }
  return value;
}

/**
 * Firestore から読んだ募集を、扱いやすい形（日時はミリ秒の数字）に変換します。
 * Firestore では日時を Timestamp という型で保存していますが、
 * アプリとのやりとりでは数字（ミリ秒）のほうが扱いやすいためです。
 */
function readPost(snap: DocumentSnapshot): StoredPost {
  const data = snap.data();
  if (!data) throw new HttpsError('not-found', '募集が見つかりません');
  return {
    authorId: data.authorId,
    groupId: data.groupId,
    title: data.title,
    eventAt: (data.eventAt as Timestamp).toMillis(),
    place: data.place ?? '',
    capacity: data.capacity,
    deadline: (data.deadline as Timestamp).toMillis(),
    status: data.status,
    reactionCount: data.reactionCount ?? 0,
  };
}

/** 「見つかりません」エラー。見る権限が無いときも、あえて同じエラーにします（存在を悟らせない）。 */
const notFound = () => new HttpsError('not-found', '募集が見つかりません');

/**
 * その人がこの募集を見てよいかを調べます。
 *   - 投稿者本人なら OK
 *   - 公開範囲のグループに、その人の電話番号が入っていれば OK
 */
function canView(post: StoredPost, groupSnap: DocumentSnapshot, uid: string, phone: string) {
  if (post.authorId === uid) return true;
  const memberPhones: string[] = groupSnap.get('memberPhones') ?? [];
  return groupSnap.exists && memberPhones.includes(phone);
}

/**
 * プッシュ通知を送ります（Expo のプッシュ通知サービスを使用）。
 * 通知が送れなくても、アプリの処理自体は成功扱いにします（ログだけ残す）。
 */
async function sendPush(tokens: string[], title: string, body: string, data: Record<string, string>) {
  const messages = tokens
    .filter((token) => token.startsWith('ExponentPushToken'))
    .map((to) => ({ to, title, body, data, sound: 'default' }));
  if (messages.length === 0) return;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) logger.warn('プッシュ通知の送信に失敗', await response.text());
  } catch (error) {
    logger.warn('プッシュ通知の送信でエラー', error);
  }
}

// ---------------------------------------------------------------------------
// 1. ゆる募集投稿
// ---------------------------------------------------------------------------
export const createPost = onCall(async (request) => {
  const { uid } = requireUser(request);
  const result = validatePostInput(request.data as CreatePostInput, Date.now());
  if (!result.ok) {
    throw new HttpsError('invalid-argument', result.errors.join('\n'));
  }
  const input = result.value;

  // 公開範囲のグループが、本当に自分のグループかを確かめます
  const groupSnap = await groupsCol().doc(input.groupId).get();
  if (!groupSnap.exists || groupSnap.get('ownerId') !== uid) {
    throw new HttpsError('permission-denied', '見せる相手のグループを選びなおしてください');
  }

  const ref = await postsCol().add({
    authorId: uid,
    groupId: input.groupId,
    title: input.title,
    eventAt: Timestamp.fromMillis(input.eventAt),
    place: input.place,
    capacity: input.capacity,
    deadline: Timestamp.fromMillis(input.deadline),
    status: 'open',
    reactionCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

// ---------------------------------------------------------------------------
// ホーム画面の一覧
// ---------------------------------------------------------------------------
export const getBoard = onCall(async (request): Promise<{ incoming: PublicPost[]; mine: PublicPost[] }> => {
  const { uid, phone } = requireUser(request);
  const now = Date.now();

  // 1. 自分の電話番号が入っているグループを探す
  const groupsSnap = await groupsCol().where('memberPhones', 'array-contains', phone).get();
  const groupIds = groupsSnap.docs.map((doc) => doc.id);

  // 2. そのグループに貼られた、募集中の募集を集める（in 検索は 30 個ずつ）
  const incomingSnaps: DocumentSnapshot[] = [];
  for (const ids of chunk(groupIds, 30)) {
    const snap = await postsCol().where('groupId', 'in', ids).where('status', '==', 'open').get();
    incomingSnaps.push(...snap.docs);
  }
  // 自分の募集と、締切を過ぎた募集は除きます
  const others = incomingSnaps
    .map((snap) => ({ id: snap.id, ref: snap.ref, post: readPost(snap) }))
    .filter(({ post }) => post.authorId !== uid && !isExpired(post.deadline, now));

  // 3. 自分が「参加する」を押しているかを、まとめて調べる
  const reactionRefs = others.map(({ ref }) => ref.collection('reactions').doc(uid));
  const reactionSnaps = reactionRefs.length > 0 ? await db.getAll(...reactionRefs) : [];
  const incoming = others.map(({ id, post }, i) =>
    toPublicPost(id, post, uid, reactionSnaps[i]?.exists ?? false),
  );

  // 4. 自分の募集（募集中のもの）
  const mineSnap = await postsCol().where('authorId', '==', uid).where('status', '==', 'open').get();
  const mine = mineSnap.docs
    .map((snap) => toPublicPost(snap.id, readPost(snap), uid, false))
    .filter((post) => !isExpired(post.deadline, now));

  // 開催日時が近い順に並べる
  const byEventAt = (a: PublicPost, b: PublicPost) => a.eventAt - b.eventAt;
  return { incoming: incoming.sort(byEventAt), mine: mine.sort(byEventAt) };
});

// ---------------------------------------------------------------------------
// 募集 1 件の詳細
// ---------------------------------------------------------------------------
export const getPost = onCall(async (request): Promise<PublicPost & { isParticipant: boolean }> => {
  const { uid, phone } = requireUser(request);
  const postId = requireId(request.data?.postId);

  const postRef = postsCol().doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw notFound();
  const post = readPost(postSnap);

  const groupSnap = await groupsCol().doc(post.groupId).get();
  if (!canView(post, groupSnap, uid, phone)) throw notFound();

  const isAuthor = post.authorId === uid;
  // 静かに終了した募集は、投稿者以外には「最初から無かった」ように見せます
  if (post.status === 'closed' && !isAuthor) throw notFound();

  const reacted = (await postRef.collection('reactions').doc(uid).get()).exists;
  // 開催確定後は、メンバー（投稿者 or 参加を押した人）以外には見せません
  if (post.status === 'confirmed' && !isAuthor && !reacted) throw notFound();

  return { ...toPublicPost(postId, post, uid, reacted), isParticipant: isAuthor || reacted };
});

// ---------------------------------------------------------------------------
// 3. そっと反応 ＋ 6. 自動クローズ ＋ 7. 自動チャット化 ＋ 8. 確定時のみ通知
// ---------------------------------------------------------------------------
export const react = onCall(async (request): Promise<{ confirmed: boolean }> => {
  const { uid, phone } = requireUser(request);
  const postId = requireId(request.data?.postId);
  const postRef = postsCol().doc(postId);
  const now = Date.now();

  // トランザクション：複数の読み書きを「まとめて 1 回」で行う仕組み。
  // 2 人が同時に「参加する」を押しても、人数の数え間違いが起きないようにします。
  const outcome = await db.runTransaction(async (tx) => {
    // --- 読み込み（トランザクションでは、書き込みより先に全部読む決まりがあります） ---
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) throw notFound();
    const post = readPost(postSnap);
    const groupSnap = await tx.get(groupsCol().doc(post.groupId));
    if (!canView(post, groupSnap, uid, phone)) throw notFound();
    if (post.authorId === uid) {
      throw new HttpsError('failed-precondition', '自分の募集には反応できません');
    }
    if (post.status !== 'open' || isExpired(post.deadline, now)) {
      throw new HttpsError('failed-precondition', 'この募集はもう終わっています');
    }

    const reactionRef = postRef.collection('reactions').doc(uid);
    if ((await tx.get(reactionRef)).exists) {
      return { confirmed: false, pushTokens: [] as string[], title: post.title };
    }

    const willBeFull = isFull(post.reactionCount + 1, post.capacity);
    if (!willBeFull) {
      // まだ人数が足りない → 反応を記録するだけ。★ 通知は送りません（途中経過は知らせない）
      tx.set(reactionRef, { userId: uid, createdAt: FieldValue.serverTimestamp() });
      tx.update(postRef, { reactionCount: FieldValue.increment(1) });
      return { confirmed: false, pushTokens: [] as string[], title: post.title };
    }

    // --- ここから「開催確定」 ---
    // メンバー ＝ 投稿者 ＋ すでに反応した人 ＋ 今押した人
    const reactionsSnap = await tx.get(postRef.collection('reactions'));
    const participantIds = [post.authorId, ...reactionsSnap.docs.map((doc) => doc.id), uid];
    const userSnaps = await tx.getAll(...participantIds.map((id) => usersCol().doc(id)));

    // ここで初めて、メンバーの名前とアイコンをまとめます
    const members: Record<string, { name: string; icon: string }> = {};
    const pushTokens: string[] = [];
    for (const snap of userSnaps) {
      members[snap.id] = { name: snap.get('name') ?? '？', icon: snap.get('icon') ?? '🙂' };
      const token = snap.get('expoPushToken');
      if (typeof token === 'string') pushTokens.push(token);
    }

    // --- 書き込み ---
    tx.set(reactionRef, { userId: uid, createdAt: FieldValue.serverTimestamp() });
    tx.update(postRef, {
      reactionCount: FieldValue.increment(1),
      status: 'confirmed',
      confirmedAt: FieldValue.serverTimestamp(),
    });

    // 7. グループトークを自動で作る（ID は募集と同じにしておくと探しやすい）
    const chatRef = chatsCol().doc(postId);
    tx.set(chatRef, {
      title: post.title,
      eventAt: Timestamp.fromMillis(post.eventAt),
      place: post.place,
      memberIds: participantIds, // このリストに入っている人だけがトークを読める（firestore.rules）
      members,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(chatRef.collection('messages').doc(), {
      userId: null, // null ＝ アプリからのお知らせ
      kind: 'system',
      body: `「${post.title}」の開催が決まりました！ここで気軽に相談しましょう。`,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 8. メンバー全員に「開催確定」のお知らせ（アプリ内のお知らせ一覧用）
    for (const id of participantIds) {
      tx.set(usersCol().doc(id).collection('notifications').doc(), {
        postId,
        body: `「${post.title}」の開催が確定しました🎉`,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { confirmed: true, pushTokens, title: post.title };
  });

  // トランザクションが成功してから、プッシュ通知を送ります
  if (outcome.confirmed) {
    await sendPush(outcome.pushTokens, 'ゆる募', `「${outcome.title}」の開催が確定しました🎉`, {
      postId,
    });
  }
  return { confirmed: outcome.confirmed };
});

/** 「やっぱりやめる」：開催確定の前なら、反応をそっと取り消せます（誰にも通知しません）。 */
export const unreact = onCall(async (request) => {
  const { uid } = requireUser(request);
  const postId = requireId(request.data?.postId);
  const postRef = postsCol().doc(postId);

  await db.runTransaction(async (tx) => {
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) throw notFound();
    const reactionRef = postRef.collection('reactions').doc(uid);
    const reactionSnap = await tx.get(reactionRef);
    if (!reactionSnap.exists) return;
    if (postSnap.get('status') !== 'open') {
      throw new HttpsError('failed-precondition', '開催が決まったあとは取り消せません');
    }
    tx.delete(reactionRef);
    tx.update(postRef, { reactionCount: FieldValue.increment(-1) });
  });
  return { ok: true };
});

/** 投稿者が募集を取り下げる。締切切れと同じく、誰にも通知せず静かに終了します。 */
export const withdrawPost = onCall(async (request) => {
  const { uid } = requireUser(request);
  const postId = requireId(request.data?.postId);
  const postRef = postsCol().doc(postId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    if (snap.get('status') !== 'open') {
      throw new HttpsError('failed-precondition', 'この募集はもう終わっています');
    }
    tx.update(postRef, { status: 'closed', closedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// 6. 自動クローズ：締切を過ぎた募集を、静かに終了させる
// ---------------------------------------------------------------------------
export const closeExpiredPosts = onSchedule(
  { schedule: 'every 10 minutes', timeZone: 'Asia/Tokyo' },
  async () => {
    // ★ ポイント：誰にも通知を送りません。
    //   「人が集まらなかった」と知らされると気まずいので、そっと掲示板から外すだけにします。
    const snap = await postsCol()
      .where('status', '==', 'open')
      .where('deadline', '<=', Timestamp.now())
      .limit(450)
      .get();
    if (snap.empty) return;
    const batch = db.batch(); // バッチ：まとめて書き込む仕組み（1 回で最大 500 件）
    snap.docs.forEach((doc) => batch.update(doc.ref, { status: 'closed', closedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
    logger.info(`${snap.size} 件の募集を静かに終了しました`);
  },
);

// ---------------------------------------------------------------------------
// 招待ボタン用：その電話番号の人が「ゆる募」を使っているか
// ---------------------------------------------------------------------------
export const checkRegistered = onCall(async (request): Promise<{ registered: string[] }> => {
  requireUser(request);
  const raw: unknown = request.data?.phones;
  if (!Array.isArray(raw) || raw.length > 100) {
    throw new HttpsError('invalid-argument', '電話番号の一覧が正しくありません');
  }
  // 重複を消して、形をそろえる（Set は重複を持たない入れ物）
  const phones = [...new Set(raw.map((p) => normalizePhone(String(p))).filter(Boolean))];
  const registered: string[] = [];
  for (const ids of chunk(phones, 30)) {
    const snap = await usersCol().where('phone', 'in', ids).select('phone').get();
    snap.docs.forEach((doc) => registered.push(doc.get('phone')));
  }
  return { registered };
});

// ---------------------------------------------------------------------------
// アカウント・データの削除（ストア審査で必須）
// ---------------------------------------------------------------------------
export const deleteAccount = onCall(async (request) => {
  const { uid, phone } = requireUser(request);

  // 1. 自分の募集を削除（反応の記録ごと消す。recursiveDelete は中の子データも消してくれます）
  const myPosts = await postsCol().where('authorId', '==', uid).get();
  for (const doc of myPosts.docs) await db.recursiveDelete(doc.ref);

  // 2. 他の人の募集への、自分の反応を削除（募集中なら人数も 1 減らす）
  const myReactions = await db.collectionGroup('reactions').where('userId', '==', uid).get();
  for (const doc of myReactions.docs) {
    const postRef = doc.ref.parent.parent as DocumentReference;
    await db.runTransaction(async (tx) => {
      const postSnap = await tx.get(postRef);
      tx.delete(doc.ref);
      if (postSnap.exists && postSnap.get('status') === 'open') {
        tx.update(postRef, { reactionCount: FieldValue.increment(-1) });
      }
    });
  }

  // 3. グループトークから抜ける＆自分の発言を削除
  const myMessages = await db.collectionGroup('messages').where('userId', '==', uid).get();
  for (const group of chunk(myMessages.docs, 400)) {
    const batch = db.batch();
    group.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  const myChats = await chatsCol().where('memberIds', 'array-contains', uid).get();
  for (const doc of myChats.docs) {
    await doc.ref.update({
      memberIds: FieldValue.arrayRemove(uid),
      [`members.${uid}`]: FieldValue.delete(), // 名前とアイコンを消す
    });
  }

  // 4. 自分のグループを削除し、他の人のグループからも自分の電話番号を消す
  const myGroups = await groupsCol().where('ownerId', '==', uid).get();
  for (const doc of myGroups.docs) await doc.ref.delete();
  const groupsWithMe = await groupsCol().where('memberPhones', 'array-contains', phone).get();
  for (const doc of groupsWithMe.docs) {
    const members: { name: string; phone: string }[] = doc.get('members') ?? [];
    await doc.ref.update({
      members: members.filter((m) => m.phone !== phone),
      memberPhones: FieldValue.arrayRemove(phone),
    });
  }

  // 5. 自分のプロフィールとお知らせを削除し、ログイン情報も消す
  await db.recursiveDelete(usersCol().doc(uid));
  await getAuth().deleteUser(uid);
  logger.info('アカウントを削除しました', { uid });
  return { ok: true };
});
