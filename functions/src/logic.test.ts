/**
 * logic.test.ts ― logic.ts の自動テスト
 *
 * 実行方法：functions フォルダで  npm test
 * Node.js に最初から入っている「node:test」というテストの仕組みを使っています。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chunk,
  isExpired,
  isFull,
  normalizePhone,
  toPublicPost,
  validatePostInput,
  type StoredPost,
} from './logic';

const NOW = new Date('2026-10-08T12:00:00+09:00').getTime();
const HOUR = 60 * 60 * 1000;

test('電話番号を +81 形式にそろえる', () => {
  assert.equal(normalizePhone('090-1234-5678'), '+819012345678');
  assert.equal(normalizePhone('09012345678'), '+819012345678');
  assert.equal(normalizePhone('+81 90 1234 5678'), '+819012345678');
  assert.equal(normalizePhone('819012345678'), '+819012345678');
  assert.equal(normalizePhone('abc'), '');
  assert.equal(normalizePhone('123'), '');
});

test('正しい募集は通り、締切が空なら開催日時が締切になる', () => {
  const result = validatePostInput(
    { title: ' カラオケ ', eventAt: NOW + 48 * HOUR, place: '駅前', groupId: 'g1', capacity: 3, deadline: undefined },
    NOW,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.title, 'カラオケ'); // 前後の空白は消える
    assert.equal(result.value.deadline, NOW + 48 * HOUR);
  }
});

test('おかしな募集はエラーになる', () => {
  const result = validatePostInput(
    { title: '', eventAt: NOW - HOUR, place: 'x'.repeat(41), groupId: '', capacity: 1, deadline: NOW + HOUR },
    NOW,
  );
  assert.equal(result.ok, false);
  // タイトル・場所・開催日時・締切（開催日時より後）・グループ・人数 の 6 つ
  if (!result.ok) assert.equal(result.errors.length, 6);
});

test('締切が開催日時より後ならエラー', () => {
  const result = validatePostInput(
    { title: 'a', eventAt: NOW + HOUR, place: '', groupId: 'g', capacity: 2, deadline: NOW + 2 * HOUR },
    NOW,
  );
  assert.equal(result.ok, false);
});

test('投稿者を含めて人数が揃ったら開催確定', () => {
  assert.equal(isFull(1, 3), false); // 投稿者 1 + 反応 1 = 2 人 < 3 人
  assert.equal(isFull(2, 3), true); //  投稿者 1 + 反応 2 = 3 人
});

test('締切の判定', () => {
  assert.equal(isExpired(NOW - 1, NOW), true);
  assert.equal(isExpired(NOW + 1, NOW), false);
});

test('アプリに返す募集には、投稿者の情報が入っていない（匿名設計）', () => {
  const stored: StoredPost = {
    authorId: 'secret-author',
    groupId: 'g1',
    title: 'カラオケ',
    eventAt: NOW,
    place: '',
    capacity: 3,
    deadline: NOW,
    status: 'open',
    reactionCount: 2,
  };
  const pub = toPublicPost('p1', stored, 'viewer', true);
  assert.equal(JSON.stringify(pub).includes('secret-author'), false);
  assert.equal('authorId' in pub, false);
  assert.equal('groupId' in pub, false);
  assert.equal(pub.interested, 2);
  assert.equal(pub.isMine, false);
  assert.equal(toPublicPost('p1', stored, 'secret-author', false).isMine, true);
});

test('配列を分ける', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 30), []);
});
