/**
 * sms.ts ― まだ「ゆる募」を使っていない人に、招待の SMS を送る
 */
import { Alert, Linking, Platform } from 'react-native';

const INVITE_MESSAGE = '「ゆる募」で気軽に予定を合わせよう！ゆるく貼って、そっと集まる。';

/** SMS アプリを、宛先と本文が入った状態で開きます。 */
export async function openInviteSms(phone: string) {
  // iOS と Android で、本文をつなぐ記号が違います（iOS は &、Android は ?）
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${phone}${separator}body=${encodeURIComponent(INVITE_MESSAGE)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('SMS アプリを開けませんでした');
  }
}
