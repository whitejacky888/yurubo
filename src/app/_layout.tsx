/**
 * _layout.tsx（いちばん外側）― アプリ全体の土台
 * ================================================
 *
 * Expo Router では、src/app フォルダの中のファイルが、そのまま「画面」になります。
 *   src/app/login.tsx       → ログイン画面
 *   src/app/(tabs)/index.tsx → ホーム（ボード）画面
 *   src/app/post/[id].tsx   → 募集の詳細（[id] の部分に募集の ID が入る）
 * そして _layout.tsx は、その中の画面たちを「どう並べるか」を決めるファイルです。
 *
 * ここでやっていること：
 *   1. 手書き風フォント Klee One を読み込む
 *   2. ログイン状態によって、見られる画面を切り替える（Stack.Protected）
 *      ・ログインしていない         → ログイン画面だけ
 *      ・ログインしたが初回登録まだ → プロフィール登録画面だけ
 *      ・登録ずみ                   → アプリ本体
 */
import { KleeOne_400Regular, KleeOne_600SemiBold, useFonts } from '@expo-google-fonts/klee-one';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { colors, fonts } from '../theme';

// 準備ができるまで、起動画面（スプラッシュ）を出したままにしておく
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const [fontsLoaded] = useFonts({ KleeOne_400Regular, KleeOne_600SemiBold });
  const { initializing, user, profile } = useAuth();
  const ready = fontsLoaded && !initializing;

  // フォントとログイン状態の確認が終わったら、起動画面を閉じる
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack
      // すべての画面に共通する、上部のヘッダーの見た目
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTitleStyle: { fontFamily: fonts.bold, color: colors.ink },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.cork },
      }}
    >
      {/* guard が true のときだけ、中の画面に行けます */}
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!!user && !profile}>
        <Stack.Screen name="signup" options={{ title: 'はじめまして' }} />
      </Stack.Protected>

      <Stack.Protected guard={!!user && !!profile}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post/new" options={{ title: '誘いをつくる', presentation: 'modal' }} />
        <Stack.Screen name="post/[id]" options={{ title: '募集の詳細' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'グループトーク' }} />
        <Stack.Screen name="group/new" options={{ title: '新しいグループを作る' }} />
        <Stack.Screen name="group/[id]" options={{ title: 'グループを編集' }} />
      </Stack.Protected>

      {/* 利用規約は、ログイン前でも読めるようにする */}
      <Stack.Screen name="terms" options={{ title: '利用規約・プライバシー' }} />
    </Stack>
  );
}
