/**
 * firebase.ts ― Firebase（認証・データベース・サーバー関数）につなぐ準備
 * =========================================================================
 *
 * React Native Firebase（@react-native-firebase/*）を使っています。
 * Firebase の設定（プロジェクト ID など）は、app.json で指定した
 *   google-services.json（Android 用） / GoogleService-Info.plist（iOS 用）
 * から自動で読み込まれるので、ここに API キーなどを書く必要はありません。
 *
 * 【エミュレーター（練習用の Firebase）を使うとき】
 * .env ファイルに EXPO_PUBLIC_USE_EMULATOR=1 と書くと、本物の Firebase ではなく、
 * パソコンで動かしている Firebase エミュレーターにつながります。
 * 本物の SMS を送らずにログインを試せるので、開発中はこちらが便利です。
 */
import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from '@react-native-firebase/functions';
import { Platform } from 'react-native';

/**
 * サーバー関数を動かす場所（東京リージョン）。
 * functions/src/index.ts の setGlobalOptions({ region }) と同じにしてください。
 */
export const REGION = 'asia-northeast1';

// アプリ全体で使う「つながり口」を 1 つずつ作っておきます
export const auth = getAuth();
export const db = getFirestore();
export const functions = getFunctions(getApp(), REGION);

// ---- エミュレーターにつなぐ設定 ----
// EXPO_PUBLIC_ で始まる環境変数は、アプリの中から読めます（.env に書く）
if (process.env.EXPO_PUBLIC_USE_EMULATOR === '1') {
  // Android のエミュレーターから見た「パソコン自身」は 10.0.2.2 という住所になります。
  // 実機で試すときは、EXPO_PUBLIC_EMULATOR_HOST にパソコンの IP アドレスを書いてください。
  const host =
    process.env.EXPO_PUBLIC_EMULATOR_HOST ?? (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
  connectAuthEmulator(auth, `http://${host}:9099`);
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
