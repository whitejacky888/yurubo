/**
 * (tabs)/index.tsx ― 画面 1：ホーム（コルクボード）
 * ===================================================
 *
 * コルクボードに付箋が貼られているイメージです。
 *   ・開催が決まった予定（グループトークへ）
 *   ・あなた宛のゆる募（他の人の募集。★ 投稿者名は出さない）
 *   ・あなたの募集
 *
 * ★ 匿名設計：募集の一覧はサーバー（getBoard）から受け取ります。
 *   サーバーが投稿者の情報を取り除いてから送ってくるので、
 *   アプリには「タイトル・日時・場所・人数」しか届きません。
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { Badge } from '../../components/Badge';
import { Empty } from '../../components/Empty';
import { Fab } from '../../components/Fab';
import { Screen } from '../../components/Screen';
import { StickyCard } from '../../components/StickyCard';
import { Txt } from '../../components/Txt';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useMyChats } from '../../lib/hooks';
import type { PublicPost } from '../../lib/types';
import { colors } from '../../theme';

export default function BoardScreen() {
  const { user, profile } = useAuth();
  const [board, setBoard] = useState<{ incoming: PublicPost[]; mine: PublicPost[] } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 開催確定したトーク（終わってから 1 日たったものは出さない）
  const chats = useMyChats(user?.uid);

  const load = useCallback(async () => {
    try {
      setBoard(await api.getBoard());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // この画面が表示されるたびに読み込みなおす（募集を作って戻ってきたときなど）
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <Screen
      onRefresh={refresh}
      refreshing={refreshing}
      overlay={<Fab label="誘いをつくる" onPress={() => router.push('/post/new')} />}
    >
      <View style={styles.header}>
        <Txt style={styles.logo}>ゆる募</Txt>
        <Txt variant="sub">{profile?.icon} {profile?.name}</Txt>
      </View>
      <Txt variant="sub">ゆるく貼って、そっと集まる。</Txt>

      {error ? <Txt style={styles.error}>{error}</Txt> : null}

      {/* ---- 開催が決まった予定 ---- */}
      {chats.length > 0 ? <Txt variant="heading">🎉 開催が決まった予定</Txt> : null}
      {chats.map((chat) => (
        <StickyCard key={chat.id} colorKey={chat.id} onPress={() => router.push(`/chat/${chat.id}`)}>
          <Txt variant="bold" style={styles.title}>{chat.title}</Txt>
          <Txt variant="sub">🗓 {formatDateTime(chat.eventAt)}{chat.place ? `　📍 ${chat.place}` : ''}</Txt>
          <Txt variant="bold" style={styles.count}>トークをひらく →</Txt>
        </StickyCard>
      ))}

      {board === null && !error ? <ActivityIndicator color={colors.ink} style={styles.loading} /> : null}

      {board ? (
        <>
          {/* ---- あなた宛のゆる募 ---- */}
          <Txt variant="heading">📌 あなた宛のゆる募</Txt>
          {board.incoming.length === 0 ? (
            <Empty text={'いまはまだ何も貼られていません。\n気が向いたら、右下の＋から誘ってみよう。'} />
          ) : null}
          {board.incoming.map((post) => (
            <StickyCard key={post.id} colorKey={post.id} onPress={() => router.push(`/post/${post.id}`)}>
              <Txt variant="bold" style={styles.title}>{post.title}</Txt>
              <Txt variant="sub">🗓 {formatDateTime(post.eventAt)}</Txt>
              {post.place ? <Txt variant="sub">📍 {post.place}</Txt> : null}
              <View style={styles.countRow}>
                <Txt variant="bold">気になってる人：{post.interested}人</Txt>
                {post.reacted ? <Badge label="手を挙げ中" color="sage" /> : null}
              </View>
            </StickyCard>
          ))}

          {/* ---- あなたの募集 ---- */}
          <Txt variant="heading">✏️ あなたの募集</Txt>
          {board.mine.length === 0 ? <Empty text="まだ募集していません。" /> : null}
          {board.mine.map((post) => (
            <StickyCard key={post.id} colorKey={post.id} paper onPress={() => router.push(`/post/${post.id}`)}>
              <Txt variant="bold" style={styles.title}>{post.title}</Txt>
              <Txt variant="sub">🗓 {formatDateTime(post.eventAt)}</Txt>
              <Txt variant="bold" style={styles.count}>
                集まり具合：{1 + post.interested} / {post.capacity}人
              </Txt>
            </StickyCard>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontFamily: 'KleeOne_600SemiBold', fontSize: 28, lineHeight: 40 },
  error: { color: colors.pin, marginTop: 8 },
  loading: { marginTop: 40 },
  title: { fontSize: 18, lineHeight: 26, marginBottom: 4 },
  count: { marginTop: 8 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
});
