/**
 * login.tsx ― ログイン画面（電話番号 ＋ SMS 認証）
 *
 * 2 つのステップがあります。
 *   ステップ 1：電話番号を入れる → Firebase が SMS で 6 桁のコードを送ってくれる
 *   ステップ 2：届いたコードを入れる → ログイン完了
 *
 * ログインが終わると、_layout.tsx の Stack.Protected が自動で次の画面に切り替えます。
 */
import { signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { StickyCard } from '../components/StickyCard';
import { Txt } from '../components/Txt';
import { auth } from '../lib/firebase';
import { displayPhone, normalizePhone } from '../lib/phone';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  // ステップ 1 が終わると、ここに「確認用の入れ物」が入ります（null のあいだはステップ 1）
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);

  /** ステップ 1：SMS を送る */
  const sendCode = async () => {
    const e164 = normalizePhone(phone);
    if (!e164) {
      Alert.alert('電話番号が正しくないみたいです', '例：090-1234-5678');
      return;
    }
    setBusy(true);
    try {
      setConfirmation(await signInWithPhoneNumber(auth, e164));
    } catch (error) {
      console.warn(error);
      Alert.alert('SMS を送れませんでした', authErrorHint(error));
    } finally {
      setBusy(false);
    }
  };

  /** ステップ 2：コードを確かめる */
  const confirmCode = async () => {
    if (!confirmation) return;
    setBusy(true);
    try {
      await confirmation.confirm(code.trim());
      // ここで成功すると、AuthProvider がログインを検知して画面が切り替わります
    } catch (error) {
      console.warn(error);
      Alert.alert('コードが違うか、有効期限が切れています', authErrorHint(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.hero}>
        <Txt style={styles.logo}>ゆる募</Txt>
        <Txt variant="sub">ゆるく貼って、そっと集まる。</Txt>
      </View>

      <StickyCard colorKey="login">
        <Txt variant="bold">誘うのも、断るのも、気まずくない。</Txt>
        <Txt variant="sub">「誰が誘ったか」「誰が反応したか」は、開催が決まるまで誰にも見えません。</Txt>
      </StickyCard>

      {confirmation === null ? (
        <Card>
          <Field
            label="電話番号"
            value={phone}
            onChangeText={setPhone}
            placeholder="090-1234-5678"
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Txt variant="sub" style={styles.hint}>SMS で 6 桁の認証コードをお送りします。</Txt>
          <PillButton title="認証コードを送る" block onPress={sendCode} loading={busy} />
        </Card>
      ) : (
        <Card>
          <Txt variant="sub">{displayPhone(normalizePhone(phone))} に届いた 6 桁のコードを入力してください。</Txt>
          <Field
            label="認証コード"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="sms-otp"
            textContentType="oneTimeCode" // iPhone で、届いた SMS のコードを候補に出してくれる
          />
          <PillButton title="確認する" block onPress={confirmCode} loading={busy} />
          <PillButton title="電話番号を入れなおす" color="plain" small onPress={() => setConfirmation(null)} style={styles.back} />
        </Card>
      )}

      <Txt variant="sub" style={styles.terms} onPress={() => router.push('/terms')}>
        利用規約・プライバシーポリシー
      </Txt>
    </Screen>
  );
}

/**
 * ログインのエラーから、原因の説明を作ります。
 * Firebase のエラーには "auth/〜" という「エラーの種類（コード）」が入っているので、
 * よくあるものは日本語で説明し、最後にコードそのものも表示します（原因を調べるときの手がかり）。
 */
function authErrorHint(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '不明';
  const hints: Record<string, string> = {
    'auth/invalid-phone-number': '電話番号の形が正しくありません。',
    'auth/missing-client-identifier':
      'アプリの確認に失敗しました。Firebase に SHA-1 / SHA-256 が登録されているか、登録後にビルドし直したかを確認してください。',
    'auth/app-not-authorized':
      'このアプリが Firebase に登録されていません。パッケージ名と google-services.json、SHA の登録を確認してください。',
    'auth/operation-not-allowed': 'Firebase で電話番号ログインが有効になっていません。',
    'auth/too-many-requests': '短い時間に何度も試したため、一時的に止められています。しばらく待ってから試してください。',
    'auth/quota-exceeded': 'SMS の送信回数の上限に達しました。',
    'auth/invalid-verification-code': '確認コードが違います。',
    'auth/session-expired': '確認コードの有効期限が切れました。もう一度コードを送ってください。',
    'auth/network-request-failed': '通信できませんでした。インターネットの接続を確認してください。',
  };
  return `${hints[code] ?? '少し時間をおいてお試しください。'}\n\n（エラーコード：${code}）`;
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 40, marginBottom: 8 },
  logo: { fontFamily: 'KleeOne_600SemiBold', fontSize: 44, lineHeight: 60 },
  hint: { marginTop: 6 },
  back: { marginTop: 12, alignSelf: 'center' },
  terms: { textAlign: 'center', textDecorationLine: 'underline', marginTop: 8 },
});
