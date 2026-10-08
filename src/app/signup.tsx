/**
 * signup.tsx ― はじめての人のプロフィール登録
 *
 * 名前とアイコンを決めて、Firestore の users/{自分のID} に保存します。
 * 電話番号は、ログインに使った番号をそのまま保存します（firestore.rules でも確認）。
 */
import { signOut } from '@react-native-firebase/auth';
import { doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ICON_CHOICES, IconPicker } from '../components/IconPicker';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { Txt } from '../components/Txt';
import { auth, db } from '../lib/firebase';
import { colors } from '../theme';

export default function SignupScreen() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) return Alert.alert('表示名は 1〜20 文字で入力してください');
    if (!agreed) return Alert.alert('利用規約とプライバシーポリシーへの同意が必要です');
    if (!user?.phoneNumber) return;

    setBusy(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        name: trimmed,
        icon,
        phone: user.phoneNumber,
        createdAt: serverTimestamp(), // サーバーの時刻を入れる
      });
      // 保存できると、AuthProvider がプロフィールを受け取り、自動でホームへ切り替わります
    } catch (error) {
      console.warn(error);
      Alert.alert('登録できませんでした', 'もう一度お試しください。');
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Txt variant="title">はじめまして！</Txt>
      <Txt variant="sub">名前とアイコンは、開催が決まったときに、一緒に行くメンバーにだけ表示されます。</Txt>
      <Card>
        <Field label="表示名" value={name} onChangeText={setName} placeholder="例：たろう" maxLength={20} />
        <Txt variant="bold" style={styles.label}>アイコン</Txt>
        <IconPicker value={icon} onChange={setIcon} />

        <Pressable
          style={styles.agreeRow}
          onPress={() => setAgreed(!agreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
            {agreed ? <Txt>✓</Txt> : null}
          </View>
          <Txt style={styles.grow}>
            <Txt style={styles.link} onPress={() => router.push('/terms')}>利用規約・プライバシーポリシー</Txt>
            に同意します
          </Txt>
        </Pressable>

        <PillButton title="はじめる" block onPress={submit} loading={busy} />
      </Card>
      <PillButton title="別の電話番号でログインしなおす" color="plain" small onPress={() => signOut(auth)} style={styles.center} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 12 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  checkboxOn: { backgroundColor: colors.yellow },
  grow: { flex: 1 },
  link: { textDecorationLine: 'underline' },
  center: { alignSelf: 'center' },
});
