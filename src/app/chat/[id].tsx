/**
 * chat/[id].tsx ― 画面 4：開催決定後のグループトーク
 * ======================================================
 *
 * 開催が確定すると、サーバーが自動でこのトークを作ります。
 * ★ ここで初めて、メンバーの名前とアイコンが見えます。
 * ★ トークを読み書きできるのはメンバーだけ（firestore.rules で制御）。
 *
 * 【不参加連絡】「行けなくなった…と伝える」で送ると、不参加連絡として目立つ色で表示されます。
 *   このトークはメンバーにしか見えないので、反応しなかった人には一切伝わりません。
 *
 * メッセージは onSnapshot で「監視」しているので、誰かが送るとすぐに表示されます。
 */
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { Badge } from '../../components/Badge';
import { PillButton } from '../../components/PillButton';
import { Screen } from '../../components/Screen';
import { StickyCard } from '../../components/StickyCard';
import { Txt } from '../../components/Txt';
import { db } from '../../lib/firebase';
import { formatDateTime, formatShort } from '../../lib/format';
import { toMillis } from '../../lib/hooks';
import type { Chat, Message } from '../../lib/types';
import { colors, fonts } from '../../theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  // トークの情報（タイトル・メンバー）を監視
  useEffect(
    () =>
      onSnapshot(doc(db, 'chats', id), (snap) => {
        const data = snap.data();
        if (!data) return;
        setChat({
          id: snap.id,
          title: data.title,
          eventAt: toMillis(data.eventAt) ?? 0,
          place: data.place ?? '',
          memberIds: data.memberIds ?? [],
          members: data.members ?? {},
        });
      }),
    [id],
  );

  // メッセージを監視（古い順）
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'chats', id, 'messages'), orderBy('createdAt')), (snap) => {
        setMessages(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              userId: data.userId ?? null,
              body: data.body,
              kind: data.kind,
              createdAt: toMillis(data.createdAt),
            };
          }),
        );
      }),
    [id],
  );

  /** メッセージを送る。kind が 'absence' なら不参加連絡 */
  const send = async (kind: 'normal' | 'absence') => {
    const text = body.trim();
    if (!text || !user) return;
    if (text.length > 500) return Alert.alert('メッセージは 500 文字以内でお願いします');
    setSending(true);
    try {
      await addDoc(collection(db, 'chats', id, 'messages'), {
        userId: user.uid,
        body: text,
        kind,
        createdAt: serverTimestamp(),
      });
      setBody('');
    } catch (error) {
      console.warn(error);
      Alert.alert('送れませんでした');
    } finally {
      setSending(false);
    }
  };

  const memberEntries = chat ? Object.entries(chat.members) : [];

  return (
    <Screen scroll={false} edges={['bottom']}>
      <Stack.Screen options={{ title: chat?.title ?? 'グループトーク' }} />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        // 新しいメッセージが来たら、いちばん下までスクロール
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          chat ? (
            <View>
              <StickyCard colorKey={chat.id}>
                <Txt variant="bold" style={styles.title}>🎉 {chat.title}</Txt>
                <Txt variant="sub">🗓 {formatDateTime(chat.eventAt)}{chat.place ? `　📍 ${chat.place}` : ''}</Txt>
              </StickyCard>
              <Txt variant="bold">メンバー</Txt>
              <View style={styles.members}>
                {memberEntries.map(([uid, member]) => (
                  <View key={uid} style={styles.member}>
                    <View style={styles.avatar}>
                      <Txt style={styles.avatarText}>{member.icon}</Txt>
                    </View>
                    <Txt variant="small" style={styles.memberName} numberOfLines={1}>
                      {member.name}{uid === user?.uid ? '（あなた）' : ''}
                    </Txt>
                  </View>
                ))}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'system') {
            return (
              <View style={[styles.bubble, styles.system]}>
                <Txt variant="sub" style={styles.center}>{item.body}</Txt>
              </View>
            );
          }
          const mine = item.userId === user?.uid;
          // 退会した人は members から消えるので、そのときは「退会したメンバー」と出す
          const author = item.userId ? chat?.members[item.userId] : undefined;
          return (
            <View style={[styles.bubble, mine && styles.mine, item.kind === 'absence' && styles.absence]}>
              <View style={styles.who}>
                <Txt variant="small">{author ? `${author.icon} ${author.name}` : '👤 退会したメンバー'}</Txt>
                {item.kind === 'absence' ? <Badge label="不参加連絡" color="coral" /> : null}
                {item.createdAt ? <Txt variant="small">{formatShort(item.createdAt)}</Txt> : null}
              </View>
              <Txt>{item.body}</Txt>
            </View>
          );
        }}
      />

      {/* ---- 入力欄 ---- */}
      <View style={styles.composer}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="メッセージを書く"
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={500}
          style={styles.input}
        />
        <View style={styles.buttons}>
          <PillButton title="送る" small onPress={() => send('normal')} disabled={sending || !body.trim()} />
          <PillButton
            title="行けなくなった…と伝える"
            small
            color="coral"
            onPress={() => send('absence')}
            disabled={sending || !body.trim()}
          />
        </View>
        <Txt variant="small">「行けなくなった」は、このトークのメンバーにだけ届きます。</Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 12, gap: 10 },
  title: { fontSize: 18, lineHeight: 26 },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
  member: { width: 72, alignItems: 'center' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, lineHeight: 32 },
  memberName: { color: colors.ink },
  bubble: {
    maxWidth: '85%',
    alignSelf: 'flex-start',
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.yellow },
  absence: { backgroundColor: colors.coral },
  system: { alignSelf: 'center', backgroundColor: 'transparent', borderStyle: 'dashed' },
  center: { textAlign: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  composer: {
    borderTopWidth: 2,
    borderTopColor: colors.ink,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
  },
  buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
