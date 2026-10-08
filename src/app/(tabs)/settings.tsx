/**
 * (tabs)/settings.tsx ― じぶん（プロフィールの変更・ログアウト・アカウント削除）
 */
import { signOut } from '@react-native-firebase/auth';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { Card } from '../../components/Card';
import { Field } from '../../components/Field';
import { IconPicker } from '../../components/IconPicker';
import { PillButton } from '../../components/PillButton';
import { Screen } from '../../components/Screen';
import { Txt } from '../../components/Txt';
import { api, errorMessage } from '../../lib/api';
import { auth, db } from '../../lib/firebase';
import { displayPhone } from '../../lib/phone';
import { colors } from '../../theme';

export default function SettingsScreen() {
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [icon, setIcon] = useState(profile?.icon ?? '🙂');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) return Alert.alert('表示名は 1〜20 文字で入力してください');
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { name: trimmed, icon });
      Alert.alert('プロフィールを更新しました');
    } catch {
      Alert.alert('保存できませんでした');
    } finally {
      setSaving(false);
    }
  };

  /** アカウント削除（ストア審査で必須の機能）。元に戻せないので 2 回確認します */
  const confirmDelete = () =>
    Alert.alert('アカウントを削除しますか？', 'グループ・募集・トークの発言など、データがすべて削除されます。', [
      { text: 'やめる', style: 'cancel' },
      {
        text: '次へ',
        style: 'destructive',
        onPress: () =>
          Alert.alert('本当に削除しますか？', 'この操作は元に戻せません。', [
            { text: 'やめる', style: 'cancel' },
            { text: '削除する', style: 'destructive', onPress: deleteAccount },
          ]),
      },
    ]);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount(); // サーバーでデータとログイン情報を削除
      await signOut(auth).catch(() => {}); // 手元のログイン状態も消す
    } catch (error) {
      Alert.alert('削除できませんでした', errorMessage(error));
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <Txt variant="title">じぶん</Txt>

      <Card>
        <Field label="表示名" value={name} onChangeText={setName} maxLength={20} />
        <Txt variant="bold" style={styles.label}>アイコン</Txt>
        <IconPicker value={icon} onChange={setIcon} />
        <Txt variant="sub" style={styles.hint}>名前とアイコンは、開催が決まったメンバーにだけ表示されます。</Txt>
        <PillButton title="保存する" block onPress={save} loading={saving} />
      </Card>

      <Card>
        <Txt variant="sub">電話番号：{profile ? displayPhone(profile.phone) : ''}</Txt>
        <Txt style={styles.link} onPress={() => router.push('/terms')}>利用規約・プライバシーポリシー</Txt>
        <PillButton title="ログアウト" color="plain" small onPress={() => signOut(auth)} style={styles.logout} />
      </Card>

      <View style={styles.divider} />
      <Txt variant="heading">アカウントを削除</Txt>
      <Card>
        <Txt variant="sub">アカウントと、グループ・募集・トークの発言などのデータがすべて削除されます。元には戻せません。</Txt>
        <PillButton title="アカウントを削除する" color="danger" block onPress={confirmDelete} loading={deleting} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 12 },
  hint: { marginTop: 8 },
  link: { textDecorationLine: 'underline', marginVertical: 8 },
  logout: { marginTop: 4 },
  divider: { borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: colors.inkSub, marginTop: 20 },
});
