/**
 * integration.test.ts ― Firebase エミュレーターを使った「結合テスト」
 * ====================================================================
 *
 * 本物の Firebase の代わりに、パソコンの中で動く「エミュレーター」を起動して、
 * アプリと同じ方法（Firebase の SDK）でサーバー関数やデータベースを呼び出し、
 * 仕様どおりに動くかを確かめます。特に、
 *   ・開催確定まで名前が漏れないこと（匿名設計）
 *   ・セキュリティルールで、見てはいけないデータが読めないこと
 * を重点的に確認しています。
 *
 * 実行方法（リポジトリのいちばん上のフォルダで）：
 *   npm run test:emulator
 * （中で firebase emulators:exec を使い、エミュレーターの起動 → テスト → 停止 を自動で行います）
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { deleteApp as deleteAdminApp, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken } from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'demo-yurubo';
const REGION = 'asia-northeast1';
const HOUR = 60 * 60 * 1000;

// 管理者（テストの準備や確認に使う。セキュリティルールは無視される）
const adminApp = initAdmin({ projectId: PROJECT_ID }, 'admin');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminDb(adminApp);

/** 1 人分の「スマホ」（それぞれ別の利用者としてログインしたアプリ） */
interface Phone {
  uid: string;
  phone: string;
  app: FirebaseApp;
  db: Firestore;
  fns: Functions;
  call: <T = unknown>(name: string, data?: unknown) => Promise<T>;
}

/** 利用者を作って、その人としてログインした「スマホ」を用意します */
async function signIn(uid: string, phone: string): Promise<Phone> {
  await adminAuth.createUser({ uid, phoneNumber: phone });
  // 電話番号ログインと同じく、トークンに phone_number が入るようにします
  const token = await adminAuth.createCustomToken(uid, { phone_number: phone });

  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, uid);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, REGION);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  await signInWithCustomToken(auth, token);

  const call = async <T,>(name: string, data: unknown = {}) => (await httpsCallable(fns, name)(data)).data as T;
  return { uid, phone, app, db, fns, call };
}

/** 失敗するはずの処理が、本当に失敗するかを確かめる */
async function assertDenied(promise: Promise<unknown>, code?: string) {
  await assert.rejects(promise, (error: { code?: string }) => {
    if (code) assert.equal(error.code, code);
    return true;
  });
}

let aiko: Phone; // 募集する人
let bunta: Phone; // グループのメンバー
let chie: Phone; // グループのメンバー
let outsider: Phone; // グループに入っていない人
let groupId: string;
let postId: string;

before(async () => {
  aiko = await signIn('aiko', '+819011110001');
  bunta = await signIn('bunta', '+819011110002');
  chie = await signIn('chie', '+819011110003');
  outsider = await signIn('outsider', '+819099990000');
  for (const [p, name] of [[aiko, 'あいこ'], [bunta, 'ぶんた'], [chie, 'ちえ'], [outsider, 'そとのひと']] as const) {
    await setDoc(doc(p.db, 'users', p.uid), { name, icon: '🙂', phone: p.phone, createdAt: serverTimestamp() });
  }
});

after(async () => {
  for (const p of [aiko, bunta, chie, outsider]) await deleteApp(p.app);
  await deleteAdminApp(adminApp);
});

test('プロフィールは、ログインした電話番号でしか作れない', async () => {
  const other = await signIn('liar', '+819055550000');
  await assertDenied(
    setDoc(doc(other.db, 'users', other.uid), { name: 'うそ', icon: '🙂', phone: '+819011110001', createdAt: serverTimestamp() }),
  );
  await deleteApp(other.app);
});

test('他人のプロフィールは読めない', async () => {
  await assertDenied(getDoc(doc(bunta.db, 'users', aiko.uid)));
});

test('グループを作れて、作った人以外は読めない', async () => {
  const ref = await addDoc(collection(aiko.db, 'groups'), {
    ownerId: aiko.uid,
    name: 'ともだち',
    members: [
      { name: 'ぶんた', phone: bunta.phone },
      { name: 'ちえ', phone: chie.phone },
    ],
    memberPhones: [bunta.phone, chie.phone],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  groupId = ref.id;
  await assertDenied(getDoc(doc(bunta.db, 'groups', groupId)));
});

test('募集を作れる（自分のグループでなければ作れない）', async () => {
  const input = { title: 'カラオケ行ける人〜', eventAt: Date.now() + 48 * HOUR, place: '駅前', capacity: 3, deadline: null };
  const created = await aiko.call<{ id: string }>('createPost', { ...input, groupId });
  postId = created.id;
  await assertDenied(bunta.call('createPost', { ...input, groupId }), 'functions/permission-denied');
});

test('★ 募集はアプリから直接読めない（セキュリティルール）', async () => {
  await assertDenied(getDoc(doc(bunta.db, 'posts', postId)));
  await assertDenied(getDocs(collection(aiko.db, 'posts')));
});

test('★ メンバーのボードには出るが、投稿者の情報は含まれない', async () => {
  const board = await bunta.call<{ incoming: Record<string, unknown>[] }>('getBoard');
  assert.equal(board.incoming.length, 1);
  const json = JSON.stringify(board);
  assert.equal(json.includes(aiko.uid), false);
  assert.equal(json.includes('あいこ'), false);
  assert.equal(board.incoming[0].interested, 0);
});

test('グループに入っていない人には見えない', async () => {
  const board = await outsider.call<{ incoming: unknown[] }>('getBoard');
  assert.equal(board.incoming.length, 0);
  await assertDenied(outsider.call('getPost', { postId }), 'functions/not-found');
  await assertDenied(outsider.call('react', { postId }), 'functions/not-found');
});

test('★ 反応しても、投稿者には人数しか分からず、通知も届かない', async () => {
  const result = await bunta.call<{ confirmed: boolean }>('react', { postId });
  assert.equal(result.confirmed, false);

  const view = await aiko.call<Record<string, unknown>>('getPost', { postId });
  assert.equal(view.interested, 1);
  assert.equal(JSON.stringify(view).includes(bunta.uid), false);

  const notes = await adminDb.collectionGroup('notifications').get();
  assert.equal(notes.size, 0); // 途中経過では通知しない
});

test('投稿者は自分の募集に反応できない', async () => {
  await assertDenied(aiko.call('react', { postId }), 'functions/failed-precondition');
});

test('★ 人数が揃ったら開催確定 → トークができ、全員に通知が届く', async () => {
  const result = await chie.call<{ confirmed: boolean }>('react', { postId });
  assert.equal(result.confirmed, true);

  const chat = await getDoc(doc(bunta.db, 'chats', postId));
  assert.equal(chat.exists(), true);
  const members = chat.data()?.members as Record<string, { name: string }>;
  assert.deepEqual(Object.values(members).map((m) => m.name).sort(), ['あいこ', 'ちえ', 'ぶんた'].sort());

  for (const p of [aiko, bunta, chie]) {
    const notes = await getDocs(collection(p.db, 'users', p.uid, 'notifications'));
    assert.equal(notes.size, 1);
  }
});

test('★ トークはメンバー以外には読めない', async () => {
  await assertDenied(getDoc(doc(outsider.db, 'chats', postId)));
  await assertDenied(getDocs(collection(outsider.db, 'chats', postId, 'messages')));
});

test('不参加連絡はメンバーだけが送れて、なりすましはできない', async () => {
  await addDoc(collection(bunta.db, 'chats', postId, 'messages'), {
    userId: bunta.uid,
    body: 'ごめん、行けなくなった',
    kind: 'absence',
    createdAt: serverTimestamp(),
  });
  // 他人になりすまして送る → ダメ
  await assertDenied(
    addDoc(collection(bunta.db, 'chats', postId, 'messages'), {
      userId: aiko.uid,
      body: 'なりすまし',
      kind: 'normal',
      createdAt: serverTimestamp(),
    }),
  );
  // メンバー以外が送る → ダメ
  await assertDenied(
    addDoc(collection(outsider.db, 'chats', postId, 'messages'), {
      userId: outsider.uid,
      body: 'こんにちは',
      kind: 'normal',
      createdAt: serverTimestamp(),
    }),
  );
  const messages = await getDocs(collection(chie.db, 'chats', postId, 'messages'));
  assert.equal(messages.docs.some((d) => d.get('kind') === 'absence'), true);
});

test('締切を過ぎた募集は、ボードから静かに消える', async () => {
  const created = await aiko.call<{ id: string }>('createPost', {
    title: '朝カフェ',
    eventAt: Date.now() + 48 * HOUR,
    place: '',
    groupId,
    capacity: 5,
    deadline: Date.now() + HOUR,
  });
  // 締切を過去にずらす（時間がたったのと同じ状態にする）
  await adminDb.doc(`posts/${created.id}`).update({ deadline: new Date(Date.now() - 1000) });
  const board = await bunta.call<{ incoming: { id: string }[] }>('getBoard');
  assert.equal(board.incoming.some((p) => p.id === created.id), false);
  await assertDenied(bunta.call('react', { postId: created.id }), 'functions/failed-precondition');
});

test('アカウントを削除すると、データが消える', async () => {
  await bunta.call('deleteAccount');

  assert.equal((await adminDb.doc('users/bunta').get()).exists, false);
  const group = await adminDb.doc(`groups/${groupId}`).get();
  assert.equal((group.get('memberPhones') as string[]).includes(bunta.phone), false);
  const chat = await adminDb.doc(`chats/${postId}`).get();
  assert.equal((chat.get('memberIds') as string[]).includes(bunta.uid), false);
  const buntaMessages = await adminDb.collectionGroup('messages').where('userId', '==', bunta.uid).get();
  assert.equal(buntaMessages.size, 0);
  await assert.rejects(adminAuth.getUser(bunta.uid));
});
