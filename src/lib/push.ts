/**
 * push.ts ― プッシュ通知の準備
 *
 * 「ゆる募」の通知は、開催が確定したときの 1 種類だけです（途中経過では送りません）。
 * ここでは、この端末に通知を送るための「宛先（Expo プッシュトークン）」を取得して、
 * 自分のプロフィールに保存します。通知を送るのはサーバー（functions）です。
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import { Platform } from 'react-native';

import { db } from './firebase';

// アプリを開いている最中に通知が来たときも、画面の上に表示する設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 通知の許可をもらって、トークンをプロフィールに保存します。
 * 許可されなかった・シミュレーターなどで取れなかった場合は、何もしません
 * （通知が無くても、アプリ内の「お知らせ」画面で確認できます）。
 */
export async function registerForPushNotifications(uid: string) {
  try {
    if (!Device.isDevice) return; // シミュレーターではプッシュ通知を受け取れない

    if (Platform.OS === 'android') {
      // Android 8 以降は「通知チャンネル」を作る必要があります
      await Notifications.setNotificationChannelAsync('default', {
        name: '開催確定のお知らせ',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    // EAS のプロジェクト ID（eas init をすると app.json に入ります）
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await updateDoc(doc(db, 'users', uid), { expoPushToken: token });
  } catch (error) {
    console.warn('プッシュ通知の準備に失敗しました', error);
  }
}
