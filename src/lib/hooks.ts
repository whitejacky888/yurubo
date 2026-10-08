/**
 * hooks.ts ― いくつかの画面で使う「データの監視」をまとめたファイル
 *
 * React では use で始まる関数を「フック」と呼びます。
 * ここにあるフックは、Firestore のデータを「監視（onSnapshot）」して、
 * データが変わったら自動で画面を更新してくれます。
 */
import { collection, onSnapshot, orderBy, query, where } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from './firebase';
import type { AppNotification, Chat, Group } from './types';

/** Firestore の日時（Timestamp）を、ミリ秒の数字に変換します。まだ決まっていなければ null */
export function toMillis(value: unknown): number | null {
  // Timestamp には toMillis()（ミリ秒にする関数）があるので、それがあるかで判断します
  const ts = value as { toMillis?: () => number } | null | undefined;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
}

/** 自分が作ったグループの一覧 */
export function useMyGroups(uid: string | undefined) {
  const [groups, setGroups] = useState<Group[] | null>(null); // null = 読み込み中
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'groups'), where('ownerId', '==', uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Group, 'id'>) }));
      list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      setGroups(list);
    });
  }, [uid]);
  return groups;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * 自分がメンバーになっている、開催確定済みのトークの一覧。
 * 開催日から 1 日たったもの（もう終わった予定）は除きます。
 */
export function useMyChats(uid: string | undefined) {
  const [chats, setChats] = useState<Chat[]>([]);
  useEffect(() => {
    if (!uid) return;
    // memberIds に自分が入っているトークだけ（firestore.rules でもそれ以外は読めない）
    const q = query(collection(db, 'chats'), where('memberIds', 'array-contains', uid), orderBy('eventAt'));
    return onSnapshot(q, (snap) => {
      const cutoff = Date.now() - ONE_DAY;
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          eventAt: toMillis(data.eventAt) ?? 0,
          place: data.place ?? '',
          memberIds: data.memberIds ?? [],
          members: data.members ?? {},
        };
      });
      setChats(list.filter((chat) => chat.eventAt > cutoff));
    });
  }, [uid]);
  return chats;
}

/** お知らせの一覧（新しい順） */
export function useNotifications(uid: string | undefined) {
  const [items, setItems] = useState<AppNotification[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            postId: data.postId ?? null,
            body: data.body,
            isRead: !!data.isRead,
            createdAt: toMillis(data.createdAt),
          };
        }),
      );
    });
  }, [uid]);
  return items;
}
