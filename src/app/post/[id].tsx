/**
 * post/[id].tsx ― 画面 3：募集の詳細
 * ====================================
 * ファイル名の [id] の部分には、URL の募集 ID が入ります（/post/abc123 なら id = "abc123"）。
 *
 *   ・投稿者本人     … 集まり具合（◯/◯人）だけが見える。★ 反応した人の名前は見えない
 *   ・それ以外の人   … 「気になってる人：◯人」と「参加する」ボタン。★ 投稿者の名前は見えない
 *   ・開催が確定済み … メンバーなら、そのままグループトークへ移動
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

import { Card } from '../../components/Card';
import { Meter } from '../../components/Meter';
import { PillButton } from '../../components/PillButton';
import { Screen } from '../../components/Screen';
import { StickyCard } from '../../components/StickyCard';
import { Txt } from '../../components/Txt';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { PublicPost } from '../../lib/types';
import { colors } from '../../theme';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<PublicPost | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getPost(id);
      // 開催確定済みで、自分がメンバーなら、グループトークへ
      if (result.status === 'confirmed' && result.isParticipant) {
        router.replace(`/chat/${id}`);
        return;
      }
      setPost(result);
    } catch {
      setMissing(true); // 見られない募集は「見つかりません」とだけ出す
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** ボタンを押したときの共通処理（通信中はボタンを押せなくする） */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert('うまくいきませんでした', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  /** 【そっと反応】「参加する」 */
  const react = () =>
    run(async () => {
      const { confirmed } = await api.react(id);
      if (confirmed) {
        Alert.alert('人数が揃って、開催が決まりました🎉');
        router.replace(`/chat/${id}`);
      } else {
        await load();
      }
    });

  const unreact = () => run(async () => {
    await api.unreact(id);
    await load();
  });

  const withdraw = () =>
    Alert.alert('この募集をそっと取り下げますか？', '誰にも通知されません。', [
      { text: 'やめる', style: 'cancel' },
      {
        text: '取り下げる',
        style: 'destructive',
        onPress: () => run(async () => {
          await api.withdrawPost(id);
          router.back();
        }),
      },
    ]);

  if (missing) {
    return (
      <Screen edges={['bottom']}>
        <StickyCard colorKey="missing" paper>
          <Txt variant="bold">募集が見つかりませんでした</Txt>
          <Txt variant="sub">募集が終わったか、見られない募集かもしれません。</Txt>
        </StickyCard>
      </Screen>
    );
  }
  if (!post) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={colors.ink} style={styles.loading} />
      </Screen>
    );
  }

  const gathered = 1 + post.interested; // 投稿者 ＋ 反応した人

  return (
    <Screen edges={['bottom']}>
      <StickyCard colorKey={post.id}>
        <Txt variant="bold" style={styles.title}>{post.title}</Txt>
        <Txt variant="sub">🗓 {formatDateTime(post.eventAt)}</Txt>
        {post.place ? <Txt variant="sub">📍 {post.place}</Txt> : null}
        <Txt variant="sub">⏳ 締切 {formatDateTime(post.deadline)}</Txt>
      </StickyCard>

      {post.status === 'closed' ? (
        // ここに来られるのは投稿者本人だけ（サーバーで制御）
        <Card>
          <Txt>この募集は、そっと終了しました。</Txt>
          <Txt variant="sub">誰にも通知は送られていません。気が向いたら、また気軽に貼ってみてください。</Txt>
        </Card>
      ) : post.isMine ? (
        <>
          <Card>
            <Txt variant="bold">集まり具合</Txt>
            <Txt style={styles.big}>{gathered} / {post.capacity}人</Txt>
            <Meter value={gathered} max={post.capacity} />
            <Txt variant="sub">誰が見たか・誰が反応したかは、あなたにも分かりません。人数が揃ったらお知らせします。</Txt>
          </Card>
          <PillButton title="募集を取り下げる" color="plain" small onPress={withdraw} disabled={busy} />
        </>
      ) : (
        <Card>
          <Txt style={styles.interested}>気になってる人：{post.interested}人</Txt>
          <Txt variant="sub">グループの誰かが誘っています。名前は開催が決まるまで、お互いに見えません。</Txt>
          {post.reacted ? (
            <>
              <Txt style={styles.raised}>✋ 手を挙げています。人数が揃ったらお知らせします。</Txt>
              <PillButton title="やっぱりやめる" color="plain" small onPress={unreact} loading={busy} />
            </>
          ) : (
            <>
              <PillButton title="✋ 参加する" color="sage" block onPress={react} loading={busy} />
              <Txt variant="sub" style={styles.center}>押さなくても、誰にも何も伝わりません。</Txt>
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 40 },
  title: { fontSize: 20, lineHeight: 30, marginBottom: 4 },
  big: { fontSize: 28, lineHeight: 40 },
  interested: { fontSize: 20, lineHeight: 30 },
  raised: { marginVertical: 10 },
  center: { textAlign: 'center', marginTop: 8 },
});
