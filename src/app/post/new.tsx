/**
 * post/new.tsx ― 画面 2：誘いをつくる（募集作成）
 *
 * 入力するもの：タイトル・日時・場所・公開範囲（グループ）・開催人数・締切
 * 「ボードに貼る」を押すと、サーバーの createPost 関数を呼んで保存します。
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { Card } from '../../components/Card';
import { DateTimeField } from '../../components/DateTimeField';
import { Field } from '../../components/Field';
import { PillButton } from '../../components/PillButton';
import { Screen } from '../../components/Screen';
import { Txt } from '../../components/Txt';
import { api, errorMessage } from '../../lib/api';
import { useMyGroups } from '../../lib/hooks';
import { colors } from '../../theme';

// 開催人数（あなたを含む）の範囲。サーバー側の functions/src/logic.ts と同じにしています
const MIN_CAPACITY = 2;
const MAX_CAPACITY = 20;

export default function NewPostScreen() {
  const { user } = useAuth();
  const groups = useMyGroups(user?.uid);

  const [title, setTitle] = useState('');
  const [eventAt, setEventAt] = useState<Date | null>(null);
  const [place, setPlace] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(3);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  // グループがまだ選ばれていなければ、最初のグループを選んでおく
  const selectedGroupId = groupId ?? groups?.[0]?.id ?? null;

  const submit = async () => {
    // まずはアプリ側でかんたんにチェック（サーバーでも同じチェックをします）
    if (!title.trim()) return Alert.alert('タイトルを入力してください');
    if (!eventAt) return Alert.alert('日時を選んでください');
    if (!selectedGroupId) return Alert.alert('見せる相手のグループを選んでください');

    setBusy(true);
    try {
      const { id } = await api.createPost({
        title: title.trim(),
        eventAt: eventAt.getTime(), // Date → ミリ秒の数字
        place: place.trim(),
        groupId: selectedGroupId,
        capacity,
        deadline: deadline ? deadline.getTime() : null,
      });
      router.replace(`/post/${id}`); // replace：戻るボタンでこの入力画面に戻らないようにする
    } catch (error) {
      Alert.alert('貼れませんでした', errorMessage(error));
      setBusy(false);
    }
  };

  if (groups === null) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={colors.ink} />
      </Screen>
    );
  }

  // グループが 1 つも無いときは、先にグループを作ってもらう
  if (groups.length === 0) {
    return (
      <Screen edges={['bottom']}>
        <Card>
          <Txt>まずは「見せる相手グループ」を作りましょう。</Txt>
          <Txt variant="sub">募集は、選んだグループの人にだけ見えます。</Txt>
          <PillButton title="＋新しいグループを作る" color="coral" block onPress={() => router.push('/group/new')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Txt variant="sub">誰に向けてかは書かなくて大丈夫。興味がある人だけが、そっと手を挙げます。</Txt>
      <Card>
        <Field label="タイトル" value={title} onChangeText={setTitle} placeholder="例：今週末カラオケ行ける人〜" maxLength={40} />
        <DateTimeField label="日時" value={eventAt} onChange={setEventAt} minimumDate={new Date()} />
        <Field label="場所（任意）" value={place} onChangeText={setPlace} placeholder="例：駅前のカラオケ" maxLength={40} />

        <Txt variant="bold" style={styles.label}>見せる相手（公開範囲）</Txt>
        <View style={styles.chips}>
          {groups.map((group) => {
            const selected = group.id === selectedGroupId;
            return (
              <Pressable
                key={group.id}
                onPress={() => setGroupId(group.id)}
                style={[styles.chip, selected && styles.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Txt>{group.name}</Txt>
              </Pressable>
            );
          })}
        </View>

        <Txt variant="bold" style={styles.label}>開催人数（あなたを含む）</Txt>
        {/* − と ＋ で人数を変える（ステッパー） */}
        <View style={styles.stepper}>
          <PillButton title="−" small color="plain" onPress={() => setCapacity(Math.max(MIN_CAPACITY, capacity - 1))} />
          <Txt style={styles.capacity}>{capacity}人</Txt>
          <PillButton title="＋" small color="plain" onPress={() => setCapacity(Math.min(MAX_CAPACITY, capacity + 1))} />
        </View>

        <DateTimeField
          label="締切（任意・空なら開催日時まで）"
          value={deadline}
          onChange={setDeadline}
          placeholder="開催日時まで"
          minimumDate={new Date()}
          clearable
        />
        <Txt variant="sub" style={styles.hint}>
          人数が揃った時点で開催決定！締切までに揃わなかったら、誰にも知らせずそっと終わります。
        </Txt>

        <PillButton title="📌 ボードに貼る" color="coral" block onPress={submit} loading={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 16, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: colors.paper,
  },
  chipOn: { backgroundColor: colors.yellow },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  capacity: { fontSize: 22, lineHeight: 30 },
  hint: { marginTop: 8 },
});
